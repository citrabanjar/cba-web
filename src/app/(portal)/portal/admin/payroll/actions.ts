"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getAccess } from "@/lib/access";
import { hasMenu } from "@/lib/roles";
import {
  PAY_BASES, PAY_CATEGORIES, PAY_KINDS, PAY_METHODS, PAYROLL_SETTING_KEY, isOneOf,
  type PayComponentInput, type PayrollSettings,
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
  if (input.method === "PERSEN" && (input.rate === null || input.rate <= 0)) return { error: "Isi persen untuk cara hitung persen." };
  const clash = await prisma.payComponent.findFirst({ where: { code, NOT: id ? { id } : undefined }, select: { id: true } });
  if (clash) return { error: "Kode sudah dipakai komponen lain." };

  const data = {
    code, name, kind: input.kind, category: input.category, method: input.method,
    amount: num(input.amount, 0, 1e10), rate: num(input.rate, 0, 100), base: input.base || null,
    capAmount: num(input.capAmount, 0, 1e10), floorAmount: num(input.floorAmount, 0, 1e10),
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
  for (const k of ["overtimeHours", "restOvertimeHours", "bonus", "kasbon", "daysPresent", "absentDays"] as const) {
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
