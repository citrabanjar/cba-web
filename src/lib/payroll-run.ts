import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { missingCoefficient, overtimePay, type PayParams, type PayrollSettings } from "@/lib/payroll";
import { getPayrollSettings } from "@/lib/payroll-settings";
import { countLeaveDays } from "@/lib/leave-balance";
import { pph21Final, pph21Monthly } from "@/lib/pph21";

const DAY = 86_400_000;
const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const utc = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

export type LineInputs = {
  workDays: number; daysPresent: number; absentDays: number;
  overtimeHours: number; restOvertimeHours: number; bonus: number; kasbon: number;
  overtimeMeals: number; // kali uang makan lembur (per kelipatan 4 jam per pengajuan)
};
export type LineItem = { code: string; name: string; kind: string; amount: number; detail: string; taxable: boolean };

export const periodLabel = (period: string) => {
  const [y, m] = period.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
};

// Rentang tanggal periode gaji. periodStartDay 1 = sebulan kalender; 21 = 21 bulan lalu s/d 20 bulan ini.
export function periodRange(period: string, s: PayrollSettings) {
  const [y, m] = period.split("-").map(Number);
  if (s.periodStartDay <= 1) return { start: new Date(Date.UTC(y, m - 1, 1)), end: new Date(Date.UTC(y, m, 0)) };
  return { start: new Date(Date.UTC(y, m - 2, s.periodStartDay)), end: new Date(Date.UTC(y, m - 1, s.periodStartDay - 1)) };
}

const monthsBetween = (from: Date, to: Date) =>
  (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth()) - (to.getUTCDate() < from.getUTCDate() ? 1 : 0);

type Ctx = Awaited<ReturnType<typeof loadContext>>;

async function loadContext(period: string) {
  const settings = await getPayrollSettings();
  const { start, end } = periodRange(period, settings);
  const year = Number(period.slice(0, 4));
  const [components, priorLines] = await Promise.all([
    prisma.payComponent.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    // Gaji final bulan-bulan sebelumnya di tahun yang sama (untuk hitung ulang PPh 21 Desember).
    prisma.payrollLine.findMany({
      where: { run: { status: "FINAL", period: { gte: `${year}-01`, lt: period } } },
      select: { userId: true, gross: true, pph21: true, items: true },
    }),
  ]);
  return { period, settings, start, end, year, components, priorLines };
}

// Hitung gaji satu karyawan. Nilai masukan (lembur, bonus, kasbon) bisa diubah admin di draft.
async function computeLine(ctx: Ctx, userId: string, includeThr: boolean, override?: Partial<LineInputs>) {
  const { settings: s, start, end, components } = ctx;
  const [user, salary] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { joinDate: true, resignDate: true, ptkpStatus: true } }),
    prisma.employeeSalary.findFirst({ where: { userId, effectiveDate: { lte: end } }, orderBy: { effectiveDate: "desc" }, include: { components: true } }),
  ]);
  const join = user?.joinDate ? utc(user.joinDate) : null;
  const from = join && join > start ? join : start;
  const resign = user?.resignDate ? utc(user.resignDate) : null;
  const to = resign && resign < end ? resign : end;

  // Masukan otomatis: hari kerja dari jadwal, hadir/mangkir dari absensi.
  const [workDaysFull, workDaysHere, att] = await Promise.all([
    countLeaveDays(userId, start, end, "HARI_KERJA"),
    from <= to ? countLeaveDays(userId, from, to, "HARI_KERJA") : Promise.resolve(0),
    prisma.attendance.groupBy({ by: ["status"], where: { userId, date: { gte: start, lte: end } }, _count: { _all: true } }),
  ]);
  const count = (st: string[]) => att.filter((a) => st.includes(a.status)).reduce((n, a) => n + a._count._all, 0);
  const inputs: LineInputs = {
    workDays: workDaysFull, daysPresent: count(["HADIR", "DINAS"]), absentDays: count(["ALPHA"]),
    overtimeHours: 0, restOvertimeHours: 0, bonus: 0, kasbon: 0, overtimeMeals: 0, ...override,
  };

  const round = (n: number) => Math.round(n / s.rounding) * s.rounding;
  const items: LineItem[] = [];
  const add = (code: string, name: string, kind: string, amount: number, detail: string, taxable: boolean) => {
    if (amount) items.push({ code, name, kind, amount: round(amount), detail, taxable });
  };
  const warnings: string[] = [];
  if (!salary) warnings.push("Gaji pokok belum diisi");

  const basicFull = salary?.basicSalary ?? 0;
  const allowances = salary?.components.filter((c) => c.type === "TUNJANGAN") ?? [];
  const fixedDeductions = salary?.components.filter((c) => c.type === "POTONGAN") ?? [];
  const fixedTotal = basicFull + allowances.reduce((a, c) => a + c.amount, 0);
  // Prorata untuk karyawan yang masuk/keluar di tengah periode.
  const calDays = Math.round((end.getTime() - start.getTime()) / DAY) + 1;
  const calHere = from <= to ? Math.round((to.getTime() - from.getTime()) / DAY) + 1 : 0;
  const factor = s.prorate === "HARI_KALENDER" ? calHere / calDays : workDaysFull ? workDaysHere / workDaysFull : 1;
  const prorate = (n: number) => (factor < 1 ? n * factor : n);
  if (factor < 1) warnings.push(`Gaji prorata ${Math.round(factor * 100)}%`);
  if (fixedTotal > 0 && fixedTotal < s.umk) warnings.push("Upah di bawah UMK");

  const tkBase = salary?.bpjsTkBase ?? fixedTotal;
  const kesBase = salary?.bpjsKesBase ?? fixedTotal;
  // Nominal per kode komponen untuk karyawan ini: GP, tunjangan profil (pakai kode), nominal perusahaan.
  const byCode = (code: string) =>
    code === "GP" ? basicFull
    : allowances.filter((a) => a.code === code).reduce((x, a) => x + a.amount, 0)
      + components.filter((c) => c.code === code && c.method === "NOMINAL_BULANAN").reduce((x, c) => x + (c.amount ?? 0), 0);
  const baseOf = (c: (typeof components)[number]) =>
    c.base === "GAJI_POKOK" ? basicFull
    : c.base === "UPAH_BPJS" ? (c.category === "BPJS_KES" ? kesBase : tkBase)
    : c.base === "KOMPONEN" ? c.baseCodes.reduce((x, code) => x + byCode(code), 0)
    : fixedTotal + components.filter((x) => x.method === "NOMINAL_BULANAN" && x.category === "TUNJANGAN_TETAP").reduce((a, x) => a + (x.amount ?? 0), 0);

  for (const c of components) {
    // Komponen yang koefisiennya belum diisi super admin tidak ikut dihitung.
    if (missingCoefficient({ ...c, params: c.params as PayParams | null })) continue;
    const params = (c.params ?? {}) as PayParams;
    if (c.category === "GAJI_POKOK") add(c.code, c.name, c.kind, prorate(basicFull), factor < 1 ? `prorata ${Math.round(factor * 100)}%` : "", c.taxable);
    else if (c.method === "NOMINAL_BULANAN") add(c.code, c.name, c.kind, c.kind === "POTONGAN" ? c.amount ?? 0 : prorate(c.amount ?? 0), "nominal semua karyawan", c.taxable);
    else if (c.method === "PER_HADIR") add(c.code, c.name, c.kind, (c.amount ?? 0) * inputs.daysPresent, `${inputs.daysPresent} hari hadir`, c.taxable);
    else if (c.method === "PER_LEMBUR") add(c.code, c.name, c.kind, (c.amount ?? 0) * inputs.overtimeMeals, `${inputs.overtimeMeals} kali (per kelipatan ${c.rate ?? 4} jam lembur)`, c.taxable);
    else if (c.method === "PERSEN") {
      let base = baseOf(c);
      if (c.floorAmount) base = Math.max(base, c.floorAmount);
      if (c.capAmount) base = Math.min(base, c.capAmount);
      if (fixedTotal > 0) add(c.code, c.name, c.kind, (base * (c.rate ?? 0)) / 100, `${c.rate}% x ${Math.round(base).toLocaleString("id-ID")}`, c.taxable);
    } else if (c.method === "RUMUS_LEMBUR") {
      const hourly = baseOf(c) / (params.divisor ?? s.overtimeDivisor);
      add(c.code, c.name, c.kind, overtimePay(hourly, inputs.overtimeHours, inputs.restOvertimeHours, s.workDaysPerWeek, params),
        `upah sejam ${Math.round(hourly).toLocaleString("id-ID")} · ${inputs.overtimeHours} jam hari kerja, ${inputs.restOvertimeHours} jam hari libur`, c.taxable);
    } else if (c.method === "RUMUS_THR" && includeThr && join) {
      const m = monthsBetween(join, end), k = params.months ?? 1, base = baseOf(c);
      add(c.code, c.name, c.kind, m >= 12 ? base * k : m >= 1 ? (base * k * m) / 12 : 0, m >= 12 ? `${k} bulan upah` : `${m}/12 x ${k} bulan upah`, c.taxable);
    } else if (c.category === "BONUS") add(c.code, c.name, c.kind, inputs.bonus, "", c.taxable);
    else if (c.method === "PRORATA_MANGKIR") add(c.code, c.name, c.kind, inputs.workDays ? (baseOf(c) / inputs.workDays) * inputs.absentDays : 0, `${inputs.absentDays} hari mangkir`, c.taxable);
    else if (c.method === "TETAP" && c.category === "POTONGAN_LAIN") add(c.code, c.name, c.kind, inputs.kasbon, "", c.taxable);
  }
  // Tunjangan dan potongan tetap per karyawan (tab Gaji & Tunjangan di profil).
  // Yang ditautkan ke master memakai kode & sifat pajak master; yang diketik bebas memakai kode urut.
  const master = new Map(components.map((c) => [c.code, c]));
  allowances.forEach((a, i) => {
    const m = a.code ? master.get(a.code) : undefined;
    add(a.code && !items.some((x) => x.code === a.code) ? a.code : `TJ${i + 1}`, a.name, "PENDAPATAN", prorate(a.amount), "tunjangan tetap karyawan", m?.taxable ?? true);
  });
  fixedDeductions.forEach((d, i) => {
    const m = d.code ? master.get(d.code) : undefined;
    add(d.code && !items.some((x) => x.code === d.code) ? d.code : `PT${i + 1}`, d.name, "POTONGAN", d.amount, "potongan tetap karyawan", m?.taxable ?? false);
  });

  // PPh 21: bruto = pendapatan + benefit yang objek pajak (JKK, JKM, BPJS Kesehatan perusahaan).
  const gross = items.filter((i) => i.taxable && (i.kind === "PENDAPATAN" || i.kind === "BENEFIT")).reduce((a, i) => a + i.amount, 0);
  const pension = items.filter((i) => i.code === "JHTK" || i.code === "JPK").reduce((a, i) => a + i.amount, 0);
  const lastMonth = ctx.period.endsWith("-12") || (resign !== null && resign <= end);
  let pph21 = 0, rate: number | null = null;
  if (components.some((c) => c.method === "PPH21_TER")) {
    if (lastMonth) {
      const prior = ctx.priorLines.filter((l) => l.userId === userId);
      const priorPension = prior.reduce((a, l) => a + (l.items as LineItem[]).filter((i) => i.code === "JHTK" || i.code === "JPK").reduce((x, i) => x + i.amount, 0), 0);
      const months = prior.length + 1;
      const f = pph21Final({
        grossYear: prior.reduce((a, l) => a + l.gross, 0) + gross, pensionDeductYear: priorPension + pension, months,
        status: user?.ptkpStatus, withheld: prior.reduce((a, l) => a + l.pph21, 0),
      });
      pph21 = f.tax;
      add("PPH21", "PPh Pasal 21", "POTONGAN", pph21, `hitung ulang setahun (${months} bulan), PKP ${f.pkp.toLocaleString("id-ID")}`, false);
      // Kelebihan potong PPh 21 bulan-bulan sebelumnya dikembalikan ke karyawan (PMK 168/2023).
      add("PPHRF", "Pengembalian lebih potong PPh 21", "PENDAPATAN", f.refund, `pajak setahun ${f.yearTax.toLocaleString("id-ID")}, sudah dipotong ${Math.round(f.yearTax + f.refund).toLocaleString("id-ID")}`, false);
    } else {
      const t = pph21Monthly(gross, user?.ptkpStatus);
      pph21 = t.tax; rate = t.rate;
      add("PPH21", "PPh Pasal 21", "POTONGAN", pph21, `TER ${t.rate}% x ${Math.round(gross).toLocaleString("id-ID")} (${user?.ptkpStatus ?? "TK/0"})`, false);
    }
  }
  if (!user?.ptkpStatus) warnings.push("Status PTKP kosong, dipakai TK/0");

  const sum = (k: string) => items.filter((i) => i.kind === k).reduce((a, i) => a + i.amount, 0);
  const earnings = sum("PENDAPATAN"), deductions = sum("POTONGAN"), benefits = sum("BENEFIT");
  return {
    inputs, items, gross, earnings, deductions, benefits, pph21: round(pph21), netPay: earnings - deductions,
    ptkp: user?.ptkpStatus ?? null, terRate: rate, warning: warnings.join(" · ") || null,
  };
}

const toJson = (v: unknown) => v as Prisma.InputJsonValue;

// Buat atau hitung ulang draft satu periode untuk semua karyawan aktif. Masukan manual (lembur, bonus,
// kasbon) yang sudah diisi di draft dipertahankan.
export async function generateRun(period: string, includeThr: boolean, by: string | null) {
  const existing = await prisma.payrollRun.findUnique({ where: { period }, include: { lines: true } });
  if (existing?.status === "FINAL") throw new Error("Periode ini sudah final.");
  const run = existing
    ? await prisma.payrollRun.update({ where: { id: existing.id }, data: { includeThr } })
    : await prisma.payrollRun.create({ data: { period, includeThr, createdBy: by } });
  const ctx = await loadContext(period);
  const employees = await prisma.user.findMany({
    where: { role: { not: "SUPER_ADMIN" }, OR: [{ isActive: true }, { resignDate: { gte: ctx.start } }] },
    select: { id: true },
  });
  for (const e of employees) {
    const prev = existing?.lines.find((l) => l.userId === e.id)?.inputs as Partial<LineInputs> | undefined;
    const manual = prev ? { overtimeHours: prev.overtimeHours, restOvertimeHours: prev.restOvertimeHours, bonus: prev.bonus, kasbon: prev.kasbon, overtimeMeals: prev.overtimeMeals ?? 0 } : undefined;
    const r = await computeLine(ctx, e.id, includeThr, manual);
    const data = { ...r, inputs: toJson(r.inputs), items: toJson(r.items) };
    await prisma.payrollLine.upsert({ where: { runId_userId: { runId: run.id, userId: e.id } }, update: data, create: { ...data, runId: run.id, userId: e.id } });
  }
  return run.id;
}

export async function recomputeLine(lineId: string, override: Partial<LineInputs>) {
  const line = await prisma.payrollLine.findUnique({ where: { id: lineId }, include: { run: true } });
  if (!line) throw new Error("Data tidak ditemukan.");
  if (line.run.status === "FINAL") throw new Error("Periode ini sudah final.");
  const ctx = await loadContext(line.run.period);
  const r = await computeLine(ctx, line.userId, line.run.includeThr, { ...(line.inputs as Partial<LineInputs>), ...override });
  await prisma.payrollLine.update({ where: { id: lineId }, data: { ...r, inputs: toJson(r.inputs), items: toJson(r.items) } });
}

// Kunci periode dan terbitkan slip gaji karyawan.
export async function finalizeRun(runId: string, by: string | null) {
  const run = await prisma.payrollRun.findUnique({ where: { id: runId }, include: { lines: true } });
  if (!run) throw new Error("Data tidak ditemukan.");
  if (run.status === "FINAL") throw new Error("Periode ini sudah final.");
  const label = periodLabel(run.period);
  const ops = run.lines.filter((l) => l.earnings > 0).map((l) => {
    const items = l.items as LineItem[];
    const pick = (...codes: string[]) => items.filter((i) => codes.includes(i.code)).reduce((a, i) => a + i.amount, 0);
    const known = ["GP", "LBR", "UM", "UML", "UT", "PPH21", "KESK", "JHTK", "JPK"];
    const otherEarn = items.filter((i) => i.kind === "PENDAPATAN" && !known.includes(i.code)).reduce((a, i) => a + i.amount, 0);
    const otherDed = items.filter((i) => i.kind === "POTONGAN" && !known.includes(i.code)).reduce((a, i) => a + i.amount, 0);
    const data = {
      periodLabel: label, basicSalary: pick("GP"), overtimePay: pick("LBR"), mealAllowance: pick("UM", "UML"), travelAllowance: pick("UT"),
      otherBenefits: otherEarn, pph21: pick("PPH21"), bpjsKesehatan: pick("KESK"), bpjsKetenagakerjaan: pick("JHTK", "JPK"),
      otherDeductions: otherDed, netPay: l.netPay,
    };
    return prisma.payslip.upsert({
      where: { userId_period: { userId: l.userId, period: run.period } },
      update: data, create: { ...data, userId: l.userId, period: run.period },
    });
  });
  await prisma.$transaction([
    ...ops,
    prisma.payrollRun.update({ where: { id: runId }, data: { status: "FINAL", finalizedBy: by, finalizedAt: new Date() } }),
  ]);
  return ops.length;
}
