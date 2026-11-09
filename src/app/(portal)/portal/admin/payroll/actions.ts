"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getAccess } from "@/lib/access";
import { hasMenu, isSuperAdmin } from "@/lib/roles";
import type { Prisma } from "@prisma/client";
import {
  PAY_BASES, PAY_CATEGORIES, PAY_KINDS, PAY_METHODS, PAYROLL_SETTING_KEY, isOneOf,
  type PayComponentInput, type PayParams, type PayrollSettings,
} from "@/lib/payroll";
import { finalizeRun, generateRun, recomputeLine, type LineInputs } from "@/lib/payroll-run";

const PATH = "/portal/admin/payroll";
type Result = { error?: string };

async function requirePayroll() {
  const access = await getAccess();
  if (!access || !hasMenu(access, "gaji")) throw new Error("Unauthorized");
  return access;
}

const num = (v: number | null, min: number, max: number) =>
  v === null || v === undefined || Number.isNaN(Number(v)) ? null : Math.max(min, Math.min(max, Number(v)));
const text = (v: string | null | undefined) => (v ?? "").trim() || null;

export async function savePayComponent(id: string | null, input: PayComponentInput): Promise<Result> {
  const access = await requirePayroll();
  const code = input.code.trim().toUpperCase();
  const name = input.name.trim();
  if (!/^[A-Z0-9]{1,8}$/.test(code)) return { error: "Kode 1-8 huruf/angka, tanpa spasi." };
  if (!name) return { error: "Nama wajib diisi." };
  if (!isOneOf(PAY_KINDS, input.kind) || !isOneOf(PAY_CATEGORIES, input.category) || !isOneOf(PAY_METHODS, input.method)) {
    return { error: "Jenis, kategori, atau cara hitung tidak valid." };
  }
  if (input.base && !isOneOf(PAY_BASES, input.base)) return { error: "Dasar perhitungan tidak valid." };
  const clash = await prisma.payComponent.findFirst({ where: { code, NOT: id ? { id } : undefined }, select: { id: true } });
  if (clash) return { error: "Kode sudah dipakai komponen lain." };

  // Dasar perhitungan boleh diatur admin payroll; angka koefisien hanya super admin.
  const superAdmin = isSuperAdmin(access.role);
  const old = id ? await prisma.payComponent.findUnique({ where: { id } }) : null;
  const pickNums = (arr: unknown, len: number) =>
    Array.isArray(arr) && arr.length === len && arr.every((x) => Number(x) > 0) ? arr.map((x) => Math.min(10, Number(x))) : undefined;
  const coef = superAdmin
    ? {
        amount: num(input.amount, 0, 1e10), rate: num(input.rate, 0, 100),
        capAmount: num(input.capAmount, 0, 1e10), floorAmount: num(input.floorAmount, 0, 1e10),
        params: input.params
          ? {
              ...(input.params.divisor ? { divisor: Math.max(1, Math.min(400, Number(input.params.divisor))) } : {}),
              ...(pickNums(input.params.workday, 2) ? { workday: pickNums(input.params.workday, 2) } : {}),
              ...(pickNums(input.params.rest6, 3) ? { rest6: pickNums(input.params.rest6, 3) } : {}),
              ...(pickNums(input.params.rest5, 3) ? { rest5: pickNums(input.params.rest5, 3) } : {}),
              ...(input.params.months ? { months: Math.max(0, Math.min(12, Number(input.params.months))) } : {}),
            }
          : null,
      }
    : {
        amount: old?.amount ?? null, rate: old?.rate ?? null, capAmount: old?.capAmount ?? null, floorAmount: old?.floorAmount ?? null,
        params: (old?.params as PayParams | null) ?? null,
      };
  const codes = await prisma.payComponent.findMany({ select: { code: true } });
  const known = new Set(["GP", ...codes.map((c) => c.code)]);
  const data = {
    code, name, kind: input.kind, category: input.category, method: input.method,
    base: input.base || null, baseCodes: input.base === "KOMPONEN" ? input.baseCodes.filter((c) => known.has(c)) : [],
    ...coef, params: (coef.params ?? undefined) as Prisma.InputJsonValue | undefined,
    taxable: !!input.taxable, legalBasis: text(input.legalBasis), note: text(input.note), isActive: !!input.isActive,
    updatedBy: access.name ?? null,
  };
  if (id) await prisma.payComponent.update({ where: { id }, data });
  else {
    const last = await prisma.payComponent.aggregate({ _max: { sortOrder: true } });
    await prisma.payComponent.create({ data: { ...data, sortOrder: (last._max.sortOrder ?? 0) + 1 } });
  }
  revalidatePath(PATH);
  return {};
}

export async function deletePayComponent(id: string): Promise<Result> {
  await requirePayroll();
  await prisma.payComponent.delete({ where: { id } });
  revalidatePath(PATH);
  return {};
}

export async function savePayrollSettings(input: PayrollSettings): Promise<Result> {
  const access = await requirePayroll();
  const n = (v: number, min: number, max: number) => Math.max(min, Math.min(max, Math.round(Number(v) || 0)));
  const value: PayrollSettings = {
    region: input.region.trim() || "-",
    umk: n(input.umk, 0, 1e9), ump: n(input.ump, 0, 1e9),
    periodStartDay: n(input.periodStartDay, 1, 28), payDay: n(input.payDay, 0, 31),
    overtimeDivisor: n(input.overtimeDivisor, 1, 400), workDaysPerWeek: input.workDaysPerWeek === 5 ? 5 : 6,
    prorate: input.prorate === "HARI_KALENDER" ? "HARI_KALENDER" : "HARI_KERJA",
    rounding: [1, 100, 1000].includes(Number(input.rounding)) ? Number(input.rounding) : 1,
  };
  if (value.umk <= 0) return { error: "UMK wajib diisi." };
  await prisma.appSetting.upsert({
    where: { key: PAYROLL_SETTING_KEY },
    update: { value, updatedBy: access.name ?? null },
    create: { key: PAYROLL_SETTING_KEY, value, updatedBy: access.name ?? null },
  });
  revalidatePath(PATH);
  return {};
}

// ─── Proses gaji bulanan ────────────────────────────────────────────────────

export async function generatePayroll(period: string, includeThr: boolean): Promise<Result> {
  const access = await requirePayroll();
  if (!/^\d{4}-\d{2}$/.test(period)) return { error: "Periode tidak valid." };
  try {
    await generateRun(period, includeThr, access.name ?? null);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Gagal menghitung gaji." };
  }
  revalidatePath(PATH);
  return {};
}

export async function updatePayrollLine(lineId: string, inputs: Partial<LineInputs>): Promise<Result> {
  await requirePayroll();
  const clean: Partial<LineInputs> = {};
  for (const k of ["overtimeHours", "restOvertimeHours", "bonus", "kasbon", "daysPresent", "absentDays", "overtimeMeals"] as const) {
    if (inputs[k] !== undefined) clean[k] = Math.max(0, Number(inputs[k]) || 0);
  }
  try {
    await recomputeLine(lineId, clean);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Gagal menghitung ulang." };
  }
  revalidatePath(PATH);
  return {};
}

export async function finalizePayroll(runId: string): Promise<Result & { count?: number }> {
  const access = await requirePayroll();
  try {
    const count = await finalizeRun(runId, access.name ?? null);
    revalidatePath(PATH);
    revalidatePath("/portal/payslip");
    return { count };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Gagal memfinalkan." };
  }
}

export async function deletePayrollDraft(runId: string): Promise<Result> {
  await requirePayroll();
  const run = await prisma.payrollRun.findUnique({ where: { id: runId }, select: { status: true } });
  if (!run) return { error: "Data tidak ditemukan." };
  if (run.status === "FINAL") return { error: "Periode final tidak bisa dihapus." };
  await prisma.payrollRun.delete({ where: { id: runId } });
  revalidatePath(PATH);
  return {};
}
