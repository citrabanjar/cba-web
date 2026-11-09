"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getAccess } from "@/lib/access";
import { hasMenu } from "@/lib/roles";
import { Prisma } from "@prisma/client";
import {
  NEEDS_BASE, NEEDS_PARAM, PAY_BASES, PAY_CATEGORIES, PAY_KINDS, PAY_METHODS, PAY_PARAMS, PAYROLL_SETTING_KEY, isOneOf, isTaxableCategory,
  type PayComponentInput, type PayParams, type PayrollSettings, type Tier,
} from "@/lib/payroll";
import { TAX_SETTING_KEY, TER_SETTING_KEY, type TaxYearConfig, type TerRow, type TerVersion } from "@/lib/pph21";
import { getTaxSettings, getTerSettings } from "@/lib/payroll-settings";
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

export async function savePayComponent(id: string | null, input: PayComponentInput): Promise<Result & { id?: string }> {
  const access = await requirePayroll();
  const code = input.code.trim().toUpperCase();
  const name = input.name.trim();
  if (!/^[A-Z0-9]{1,8}$/.test(code)) return { error: "Kode 1-8 huruf/angka, tanpa spasi." };
  if (!name) return { error: "Nama wajib diisi." };
  const existing = id ? await prisma.payComponent.findUnique({ where: { id }, select: { method: true, code: true } }) : null;
  const system = existing?.method === "PPH21";
  // Komponen sistem (PPh 21) hanya bisa diganti nama dan status aktif.
  const method = system ? "PPH21" : input.method;
  if (!isOneOf(PAY_KINDS, input.kind) || !isOneOf(PAY_CATEGORIES, input.category) || (!system && !isOneOf(PAY_METHODS, method))) {
    return { error: "Jenis, kategori, atau cara hitung tidak valid." };
  }
  if (existing?.code === "GP" && (code !== "GP" || method !== "INPUT")) return { error: "Gaji Pokok harus kode GP dengan nilai Input." };
  if (input.base && !isOneOf(PAY_BASES, input.base)) return { error: "Dasar nilai tidak valid." };
  const param = NEEDS_PARAM.includes(method) ? input.param : method === "LEMBUR" ? "JAM_LEMBUR" : method === "THR" ? "MASA_KERJA" : null;
  if (NEEDS_PARAM.includes(method) && !isOneOf(PAY_PARAMS, param)) return { error: "Pilih parameter rumus." };
  const clash = await prisma.payComponent.findFirst({ where: { code, NOT: id ? { id } : undefined }, select: { id: true } });
  if (clash) return { error: "Kode sudah dipakai komponen lain." };

  const ip: PayParams = input.params ?? {};
  const n = (v: unknown, min: number, max: number) => Math.max(min, Math.min(max, Number(v) || 0));
  const cleanTiers = (t: Tier[] | null | undefined) => {
    if (!Array.isArray(t) || !t.length) return null;
    const rows = t.slice(0, 10).map((x, i, all) => ({ upTo: i === all.length - 1 ? null : n(x.upTo, 0, 24), x: n(x.x, 0, 10) }));
    for (let i = 1; i < rows.length - 1; i++) if ((rows[i].upTo ?? 0) <= (rows[i - 1].upTo ?? 0)) return "bad";
    return rows;
  };
  const work = method === "LEMBUR" ? cleanTiers(ip.work) : null;
  const rest = method === "LEMBUR" ? cleanTiers(ip.rest) : null;
  if (work === "bad" || rest === "bad") return { error: "Batas jam tarif lembur harus naik dari baris ke baris." };
  if (method === "LEMBUR" && !work) return { error: "Isi minimal satu baris tarif lembur." };
  const earning = input.kind === "PENDAPATAN";
  const params: PayParams = {
    ...(earning && ip.prorate && method !== "THR" ? { prorate: true } : {}),
    ...(earning && ip.fixedWage && method !== "THR" ? { fixedWage: true } : {}),
    ...(method === "PER_SATUAN" && Number(ip.min) > 0 ? { min: n(ip.min, 0, 1e6) } : {}),
    ...(method === "PER_SATUAN" && Number(ip.step) > 0 ? { step: n(ip.step, 0.5, 1e6) } : {}),
    ...(method === "LEMBUR" ? { divisor: n(ip.divisor || 173, 1, 400), work: work as Tier[], rest: rest as Tier[] | null } : {}),
    ...(method === "THR" ? { months: n(ip.months ?? 1, 0, 24), minMonths: n(ip.minMonths ?? 1, 0, 600), proportional: ip.proportional !== false } : {}),
  };
  const coef = {
    amount: num(input.amount, 0, 1e10), rate: method === "PERSEN" ? num(input.rate, 0, 100) : null,
    capAmount: num(input.capAmount, 0, 1e10), floorAmount: num(input.floorAmount, 0, 1e10),
    params: Object.keys(params).length ? params : null,
  };
  const codes = await prisma.payComponent.findMany({ select: { code: true } });
  const known = new Set(["GP", ...codes.map((c) => c.code)]);
  const data = {
    code, name, kind: input.kind, category: input.category, method, param,
    base: NEEDS_BASE.includes(input.method) ? input.base || "UPAH_TETAP" : null,
    baseCodes: NEEDS_BASE.includes(input.method) && input.base === "KOMPONEN" ? input.baseCodes.filter((c) => known.has(c) && c !== code) : [],
    ...coef, params: (coef.params ?? undefined) as Prisma.InputJsonValue | undefined,
    taxable: isTaxableCategory(input.category), isActive: !!input.isActive,
    updatedBy: access.name ?? null,
  };
  let savedId = id;
  if (id) await prisma.payComponent.update({ where: { id }, data: { ...data, params: data.params ?? Prisma.DbNull } });
  else {
    const last = await prisma.payComponent.aggregate({ _max: { sortOrder: true } });
    savedId = (await prisma.payComponent.create({ data: { ...data, sortOrder: (last._max.sortOrder ?? 0) + 1 } })).id;
  }
  revalidatePath(PATH);
  return { id: savedId ?? undefined };
}

// Tempel komponen ke karyawan: daftar karyawan yang dicentang menggantikan daftar sebelumnya.
export async function setComponentAssignments(componentId: string, userIds: string[]): Promise<Result> {
  const access = await requirePayroll();
  const valid = await prisma.user.findMany({ where: { id: { in: userIds }, role: { not: "SUPER_ADMIN" } }, select: { id: true } });
  const ids = valid.map((u) => u.id);
  const today = new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date())}T00:00:00Z`);
  const yesterday = new Date(today.getTime() - 86_400_000);
  const rows = await prisma.employeePayComponent.findMany({ where: { componentId } });
  const ops: Prisma.PrismaPromise<unknown>[] = [];
  for (const r of rows) {
    const activeNow = (!r.endDate || r.endDate >= today) && (!r.startDate || r.startDate <= today);
    if (ids.includes(r.userId)) {
      // Dicentang lagi padahal sudah berakhir: berlaku kembali mulai hari ini.
      if (r.endDate && r.endDate < today) ops.push(prisma.employeePayComponent.update({ where: { id: r.id }, data: { startDate: today, endDate: null } }));
    } else if (activeNow) {
      // Dilepas: tempelan polos dihapus; yang punya riwayat tanggal/keterangan diakhiri kemarin.
      ops.push(r.startDate || r.endDate || r.note
        ? prisma.employeePayComponent.update({ where: { id: r.id }, data: { endDate: yesterday } })
        : prisma.employeePayComponent.delete({ where: { id: r.id } }));
    }
  }
  const existing = new Set(rows.map((r) => r.userId));
  ops.push(prisma.employeePayComponent.createMany({
    data: ids.filter((u) => !existing.has(u)).map((userId) => ({ userId, componentId, createdBy: access.name ?? null })),
  }));
  await prisma.$transaction(ops);
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
    periodStartDay: n(input.periodStartDay, 1, 28), payDay: n(input.payDay, 0, 31),
    overtimeDivisor: n(input.overtimeDivisor, 1, 400), workDaysPerWeek: input.workDaysPerWeek === 5 ? 5 : 6,
    prorate: input.prorate === "HARI_KALENDER" ? "HARI_KALENDER" : "HARI_KERJA",
    rounding: [1, 100, 1000].includes(Number(input.rounding)) ? Number(input.rounding) : 1,
    weekStartDay: n(input.weekStartDay, 0, 6),
  };
  await prisma.appSetting.upsert({
    where: { key: PAYROLL_SETTING_KEY },
    update: { value, updatedBy: access.name ?? null },
    create: { key: PAYROLL_SETTING_KEY, value, updatedBy: access.name ?? null },
  });
  revalidatePath(PATH);
  return {};
}

// ─── Proses gaji bulanan ────────────────────────────────────────────────────

export async function generatePayroll(period: string, extraCodes: string[]): Promise<Result> {
  const access = await requirePayroll();
  if (!/^\d{4}-\d{2}(-\d{2})?$/.test(period)) return { error: "Periode tidak valid." };
  try {
    const valid = await prisma.payComponent.findMany({ where: { code: { in: extraCodes }, method: "THR" }, select: { code: true } });
    await generateRun(period, valid.map((c) => c.code), access.name ?? null);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Gagal menghitung gaji." };
  }
  revalidatePath(PATH);
  return {};
}

export async function updatePayrollLine(lineId: string, inputs: Partial<LineInputs>): Promise<Result> {
  await requirePayroll();
  const clean: Partial<LineInputs> = {};
  for (const k of ["daysPresent", "absentDays", "tripDays", "trips", "leaveDays"] as const) {
    if (inputs[k] !== undefined) clean[k] = Math.max(0, Math.min(366, Number(inputs[k]) || 0));
  }
  const hours = (v: unknown) => (Array.isArray(v) ? v.map(Number).filter((x) => x > 0 && x <= 24).slice(0, 62) : undefined);
  if (inputs.otWork) clean.otWork = hours(inputs.otWork);
  if (inputs.otRest) clean.otRest = hours(inputs.otRest);
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

// Pengaturan PPh 21 satu tahun pajak (PTKP, tarif Pasal 17, biaya jabatan).
export async function saveTaxYear(year: number, cfg: TaxYearConfig): Promise<Result> {
  const access = await requirePayroll();
  if (!Number.isInteger(year) || year < 2020 || year > 2100) return { error: "Tahun pajak tidak valid." };
  const n = (v: unknown, max: number) => Math.max(0, Math.min(max, Number(v) || 0));
  const brackets = (cfg.brackets ?? []).slice(0, 10).map((b, i, all) => ({ upTo: i === all.length - 1 ? null : n(b.upTo, 1e13), rate: n(b.rate, 100) }));
  if (!brackets.length) return { error: "Isi minimal satu lapisan tarif." };
  for (let i = 1; i < brackets.length - 1; i++) if ((brackets[i].upTo ?? 0) <= (brackets[i - 1].upTo ?? 0)) return { error: "Batas lapisan tarif harus naik." };
  const value: TaxYearConfig = {
    ptkpSelf: n(cfg.ptkpSelf, 1e10), ptkpMarried: n(cfg.ptkpMarried, 1e10), ptkpDependent: n(cfg.ptkpDependent, 1e10),
    maxDependents: Math.round(n(cfg.maxDependents, 10)), brackets, jobCostRate: n(cfg.jobCostRate, 100), jobCostMaxMonthly: n(cfg.jobCostMaxMonthly, 1e9),
  };
  if (!value.ptkpSelf) return { error: "PTKP wajib pajak sendiri wajib diisi." };
  const all = { ...(await getTaxSettings()), [String(year)]: value };
  await prisma.appSetting.upsert({
    where: { key: TAX_SETTING_KEY },
    update: { value: all, updatedBy: access.name ?? null },
    create: { key: TAX_SETTING_KEY, value: all, updatedBy: access.name ?? null },
  });
  revalidatePath(PATH);
  return {};
}

// Simpan satu versi tarif TER (berlaku mulai tanggal tertentu). originalDate = tanggal versi yang diubah.
export async function saveTerVersion(originalDate: string | null, v: TerVersion): Promise<Result> {
  const access = await requirePayroll();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.effectiveDate)) return { error: "Tanggal berlaku wajib diisi." };
  const clean = (rows: TerRow[] | undefined) => {
    const r = (rows ?? []).slice(0, 80).map((x, i, all) => ({
      upTo: i === all.length - 1 ? null : Math.max(0, Number(x.upTo) || 0), rate: Math.max(0, Math.min(100, Number(x.rate) || 0)),
    }));
    for (let i = 1; i < r.length - 1; i++) if ((r[i].upTo ?? 0) <= (r[i - 1].upTo ?? 0)) return null;
    return r.length ? r : null;
  };
  const A = clean(v.A), B = clean(v.B), C = clean(v.C), daily = clean(v.daily);
  if (!A || !B || !C || !daily) return { error: "Batas penghasilan tiap tabel TER harus naik dari baris ke baris." };
  const list = (await getTerSettings()).filter((x) => x.effectiveDate !== originalDate && x.effectiveDate !== v.effectiveDate);
  const all = [...list, { effectiveDate: v.effectiveDate, A, B, C, daily }].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
  await prisma.appSetting.upsert({
    where: { key: TER_SETTING_KEY },
    update: { value: all, updatedBy: access.name ?? null },
    create: { key: TER_SETTING_KEY, value: all, updatedBy: access.name ?? null },
  });
  revalidatePath(PATH);
  return {};
}

export async function deleteTerVersion(effectiveDate: string): Promise<Result> {
  const access = await requirePayroll();
  const all = (await getTerSettings()).filter((x) => x.effectiveDate !== effectiveDate);
  await prisma.appSetting.upsert({
    where: { key: TER_SETTING_KEY },
    update: { value: all, updatedBy: access.name ?? null },
    create: { key: TER_SETTING_KEY, value: all, updatedBy: access.name ?? null },
  });
  revalidatePath(PATH);
  return {};
}
