import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { evaluate, type PayContext, type PayParams, type PayrollSettings } from "@/lib/payroll";
import { getPayrollSettings, getTaxSettings } from "@/lib/payroll-settings";
import { countLeaveDays } from "@/lib/leave-balance";
import { pph21Final, pph21Monthly, taxYearConfig } from "@/lib/pph21";

const DAY = 86_400_000;
const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const utc = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

// Masukan satu karyawan per periode. Angka otomatis (hadir, dinas, cuti) diambil dari data portal;
// jam lembur per pengajuan dan nilai komponen "input tiap periode" diisi admin di draft.
export type LineInputs = {
  workDays: number; daysPresent: number; absentDays: number;
  tripDays: number; trips: number; leaveDays: number; monthsOfService: number;
  otWork: number[]; otRest: number[]; // jam lembur per pengajuan (hari kerja / hari libur)
  values: Record<string, number>; // nilai komponen input tiap periode, per kode (mis. BNS, KSB)
};
export type LineItem = { code: string; name: string; kind: string; amount: number; detail: string; taxable: boolean };

// Masukan lama (sebelum komponen fleksibel) dibaca ulang ke bentuk baru.
export function normalizeInputs(raw: unknown): Partial<LineInputs> {
  const r = (raw ?? {}) as Record<string, unknown>;
  const n = (v: unknown) => Math.max(0, Number(v) || 0);
  const arr = (v: unknown) => (Array.isArray(v) ? v.map(n).filter((x) => x > 0) : undefined);
  const out: Partial<LineInputs> = {};
  for (const k of ["workDays", "daysPresent", "absentDays", "tripDays", "trips", "leaveDays", "monthsOfService"] as const) if (r[k] !== undefined) out[k] = n(r[k]);
  out.otWork = arr(r.otWork) ?? (n(r.overtimeHours) ? [n(r.overtimeHours)] : []);
  out.otRest = arr(r.otRest) ?? (n(r.restOvertimeHours) ? [n(r.restOvertimeHours)] : []);
  const values: Record<string, number> = {};
  if (r.values && typeof r.values === "object") for (const [k, v] of Object.entries(r.values as Record<string, unknown>)) if (n(v)) values[k] = n(v);
  if (n(r.bonus) && values.BNS === undefined) values.BNS = n(r.bonus);
  if (n(r.kasbon) && values.KSB === undefined) values.KSB = n(r.kasbon);
  out.values = values;
  return out;
}

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
  const [components, priorLines, taxAll] = await Promise.all([
    prisma.payComponent.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" }, include: { employees: { select: { userId: true, startDate: true, endDate: true } } } }),
    // Gaji final bulan-bulan sebelumnya di tahun yang sama (untuk hitung ulang PPh 21 Desember).
    prisma.payrollLine.findMany({
      where: { run: { status: "FINAL", period: { gte: `${year}-01`, lt: period } } },
      select: { userId: true, gross: true, pph21: true, items: true },
    }),
    getTaxSettings(),
  ]);
  return { period, settings, start, end, year, components, priorLines, tax: taxYearConfig(taxAll, year) };
}

// Hitung gaji satu karyawan dari komponen yang ditempel ke karyawan itu.
async function computeLine(ctx: Ctx, userId: string, nonRoutine: string[], override?: Partial<LineInputs>) {
  const { settings: s, start, end } = ctx;
  // Komponen yang tertempel ke karyawan ini dan masa berlakunya bersinggungan dengan periode.
  const tempel = new Map<string, { startDate: Date | null; endDate: Date | null }>();
  for (const c of ctx.components) {
    const a = c.employees.find((e) => e.userId === userId && (!e.startDate || utc(e.startDate) <= end) && (!e.endDate || utc(e.endDate) >= start));
    if (a) tempel.set(c.code, a);
  }
  const components = ctx.components.filter((c) => tempel.has(c.code));
  const [user, salary, trips, leaves] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { joinDate: true, resignDate: true, ptkpStatus: true } }),
    prisma.employeeSalary.findFirst({ where: { userId, effectiveDate: { lte: end } }, orderBy: { effectiveDate: "desc" }, include: { components: true } }),
    prisma.businessTrip.findMany({ where: { userId, status: "APPROVED", startDate: { lte: end }, endDate: { gte: start } }, select: { startDate: true, endDate: true } }),
    prisma.leaveRequest.findMany({ where: { userId, status: "APPROVED", startDate: { lte: end }, endDate: { gte: start } }, select: { startDate: true, endDate: true } }),
  ]);
  const join = user?.joinDate ? utc(user.joinDate) : null;
  const from = join && join > start ? join : start;
  const resign = user?.resignDate ? utc(user.resignDate) : null;
  const to = resign && resign < end ? resign : end;
  const clip = (a: Date, b: Date) => ({ a: utc(a) < start ? start : utc(a), b: utc(b) > end ? end : utc(b) });

  // Masukan otomatis: hari kerja dari jadwal, hadir/mangkir dari absensi, dinas & cuti yang disetujui.
  const tripDates = new Set<number>();
  for (const t of trips) { const { a, b } = clip(t.startDate, t.endDate); for (let d = a.getTime(); d <= b.getTime(); d += DAY) tripDates.add(d); }
  const [workDaysFull, workDaysHere, att, leaveDays] = await Promise.all([
    countLeaveDays(userId, start, end, "HARI_KERJA"),
    from <= to ? countLeaveDays(userId, from, to, "HARI_KERJA") : Promise.resolve(0),
    prisma.attendance.groupBy({ by: ["status"], where: { userId, date: { gte: start, lte: end } }, _count: { _all: true } }),
    Promise.all(leaves.map((l) => { const { a, b } = clip(l.startDate, l.endDate); return countLeaveDays(userId, a, b, "HARI_KERJA"); })).then((x) => x.reduce((p, q) => p + q, 0)),
  ]);
  const count = (st: string[]) => att.filter((a) => st.includes(a.status)).reduce((n, a) => n + a._count._all, 0);
  const inputs: LineInputs = {
    workDays: workDaysFull, daysPresent: count(["HADIR", "DINAS"]), absentDays: count(["ALPHA"]),
    tripDays: tripDates.size, trips: trips.filter((t) => utc(t.startDate) >= start).length, leaveDays,
    monthsOfService: join ? Math.max(0, monthsBetween(join, end)) : 0,
    otWork: [], otRest: [], values: {}, ...override,
  };

  const round = (n: number) => Math.round(n / s.rounding) * s.rounding;
  const items: LineItem[] = [];
  const add = (code: string, name: string, kind: string, amount: number, detail: string, taxable: boolean) => {
    if (amount) items.push({ code, name, kind, amount: round(amount), detail, taxable });
  };
  const warnings: string[] = [];
  if (!salary) warnings.push("Gaji pokok belum diisi");
  if (components.length === 0) warnings.push("Belum ada komponen yang ditempel");

  const basicFull = salary?.basicSalary ?? 0;
  // Isian profil yang tertaut ke komponen master hanya berlaku selama komponennya tertempel.
  const masterCodes = new Set(ctx.components.map((c) => c.code));
  const live = (c: { code: string | null }) => !c.code || !masterCodes.has(c.code) || tempel.has(c.code);
  const allowances = salary?.components.filter((c) => c.type === "TUNJANGAN" && live(c)) ?? [];
  const fixedDeductions = salary?.components.filter((c) => c.type === "POTONGAN" && live(c)) ?? [];
  // Upah tetap = gaji pokok + komponen bercentang "upah tetap" (isian profil atau flat) + tunjangan profil yang diketik bebas.
  const paramsOf = (c: { params: unknown }) => (c.params ?? {}) as PayParams;
  const fixedCodes = new Set(ctx.components.filter((c) => paramsOf(c).fixedWage).map((c) => c.code));
  const fixedTotal = basicFull + allowances.filter((a) => !a.code || !masterCodes.has(a.code) || fixedCodes.has(a.code)).reduce((x, a) => x + a.amount, 0)
    + components.filter((c) => c.method === "NOMINAL" && fixedCodes.has(c.code)).reduce((a, c) => a + (c.amount ?? 0), 0);
  // Prorata untuk karyawan yang masuk/keluar di tengah periode.
  const calDays = Math.round((end.getTime() - start.getTime()) / DAY) + 1;
  const calHere = from <= to ? Math.round((to.getTime() - from.getTime()) / DAY) + 1 : 0;
  const factor = s.prorate === "HARI_KALENDER" ? calHere / calDays : workDaysFull ? workDaysHere / workDaysFull : 1;
  const prorate = (n: number) => (factor < 1 ? n * factor : n);
  if (factor < 1) warnings.push(`Gaji prorata ${Math.round(factor * 100)}%`);

  // Masa berlaku tempelan yang tidak penuh satu periode (mis. tunjangan jabatan berhenti karena demosi).
  const fmt = (d: Date) => d.toLocaleDateString("id-ID", { day: "numeric", month: "short", timeZone: "UTC" });
  const windowOf = (code: string) => {
    const t = tempel.get(code);
    const a = [from, t?.startDate ? utc(t.startDate) : null].reduce((x, y) => (y && y > x! ? y : x), from)!;
    const b = [to, t?.endDate ? utc(t.endDate) : null].reduce((x, y) => (y && y < x! ? y : x), to)!;
    return { a, b, partial: a.getTime() !== from.getTime() || b.getTime() !== to.getTime() };
  };
  const windowCache = new Map<string, Promise<{ factor: number; ctx: PayContext | null }>>();
  // Faktor prorata dan data parameter khusus masa berlaku komponen.
  const windowFor = (code: string, base: PayContext) => {
    const w = windowOf(code);
    if (!w.partial) return Promise.resolve({ factor, ctx: base, label: "" });
    const key = `${w.a.getTime()}-${w.b.getTime()}`;
    if (!windowCache.has(key)) {
      windowCache.set(key, (async () => {
        if (w.a > w.b) return { factor: 0, ctx: null };
        const [wd, attW, leaveW] = await Promise.all([
          countLeaveDays(userId, w.a, w.b, "HARI_KERJA"),
          prisma.attendance.groupBy({ by: ["status"], where: { userId, date: { gte: w.a, lte: w.b } }, _count: { _all: true } }),
          Promise.all(leaves.map((l) => {
            const a = utc(l.startDate) < w.a ? w.a : utc(l.startDate), b = utc(l.endDate) > w.b ? w.b : utc(l.endDate);
            return a <= b ? countLeaveDays(userId, a, b, "HARI_KERJA") : Promise.resolve(0);
          })).then((x) => x.reduce((p, q) => p + q, 0)),
        ]);
        const days = Math.round((w.b.getTime() - w.a.getTime()) / DAY) + 1;
        const f = s.prorate === "HARI_KALENDER" ? days / calDays : workDaysFull ? wd / workDaysFull : 1;
        const cnt = (st: string[]) => attW.filter((x) => st.includes(x.status)).reduce((n, x) => n + x._count._all, 0);
        const dates = [...tripDates].filter((d) => d >= w.a.getTime() && d <= w.b.getTime()).length;
        return {
          factor: f,
          ctx: {
            ...base,
            qty: {
              ...base.qty, HARI_HADIR: cnt(["HADIR", "DINAS"]), HARI_MANGKIR: cnt(["ALPHA"]), HARI_CUTI: leaveW, HARI_DINAS: dates,
              KALI_DINAS: trips.filter((t) => utc(t.startDate) >= w.a && utc(t.startDate) <= w.b).length,
            },
          },
        };
      })());
    }
    return windowCache.get(key)!.then((r) => ({ ...r, label: `berlaku ${fmt(w.a)} - ${fmt(w.b)}` }));
  };
  if (fixedTotal > 0 && fixedTotal < s.umk) warnings.push("Upah di bawah UMK");

  // Nilai komponen input: GP dari gaji pokok, tetap dari profil (pakai kode), tiap periode dari draft.
  const values: Record<string, number> = { GP: basicFull };
  for (const x of [...allowances, ...fixedDeductions]) if (x.code) values[x.code] = (values[x.code] ?? 0) + x.amount;
  for (const c of components) if (c.method === "NOMINAL") values[c.code] = (values[c.code] ?? 0) + (c.amount ?? 0);
  const pctx: PayContext = {
    values, fixedTotal, bpjsTk: salary?.bpjsTkBase ?? fixedTotal, bpjsKes: salary?.bpjsKesBase ?? fixedTotal,
    qty: {
      HARI_HADIR: inputs.daysPresent, HARI_MANGKIR: inputs.absentDays, HARI_KERJA: inputs.workDays, MASA_KERJA: inputs.monthsOfService,
      HARI_DINAS: inputs.tripDays, KALI_DINAS: inputs.trips, HARI_CUTI: inputs.leaveDays,
    },
    overtimeWork: inputs.otWork, overtimeRest: inputs.otRest, workDaysPerWeek: s.workDaysPerWeek, overtimeDivisor: s.overtimeDivisor, nonRoutine,
  };

  const used = new Set<string>();
  const join2 = (...x: string[]) => x.filter(Boolean).join(" · ");
  for (const c of components) {
    const params = (c.params ?? null) as PayParams | null;
    const earning = c.kind === "PENDAPATAN";
    if (c.method === "PPH21") continue;
    used.add(c.code);
    // Data parameter mengikuti masa berlaku tempelan (kecuali BPJS/persen); nominal diprorata hanya bila dicentang Prorata.
    const w = c.method === "PERSEN" ? { factor, ctx: pctx, label: "" } : await windowFor(c.code, pctx);
    if (!w.ctx) continue;
    const doProrate = earning && !!params?.prorate && w.factor < 1;
    const pr = (n: number) => (doProrate ? n * w.factor : n);
    const prLabel = doProrate ? w.label || `prorata ${Math.round(w.factor * 100)}%` : "";
    if (c.method === "INPUT") {
      const v = c.code === "GP" ? basicFull : values[c.code] ?? 0;
      add(c.code, c.name, c.kind, pr(v), c.code === "GP" ? prLabel : join2("nilai di profil karyawan", prLabel), c.taxable);
      continue;
    }
    if (c.method === "PERSEN" && fixedTotal <= 0) continue;
    const r = evaluate({ ...c, params }, w.ctx);
    if (!r) continue;
    add(c.code, c.name, c.kind, pr(r.amount), join2(r.detail, prLabel || w.label), c.taxable);
  }
  // Tunjangan/potongan profil yang diketik bebas (tanpa komponen master) tetap dibayar.
  // Yang tertaut ke komponen master hanya dibayar lewat tempelan yang masih berlaku.
  const master = new Map(ctx.components.map((c) => [c.code, c]));
  allowances.forEach((a, i) => {
    if (a.code && (used.has(a.code) || master.has(a.code))) return;
    const m = a.code ? master.get(a.code) : undefined;
    add(a.code && !items.some((x) => x.code === a.code) ? a.code : `TJ${i + 1}`, a.name, "PENDAPATAN", prorate(a.amount), "tunjangan tetap karyawan", m?.taxable ?? true);
  });
  fixedDeductions.forEach((d, i) => {
    if (d.code && (used.has(d.code) || master.has(d.code))) return;
    const m = d.code ? master.get(d.code) : undefined;
    add(d.code && !items.some((x) => x.code === d.code) ? d.code : `PT${i + 1}`, d.name, "POTONGAN", d.amount, "potongan tetap karyawan", m?.taxable ?? false);
  });

  // PPh 21: bruto = pendapatan + benefit objek pajak (premi asuransi perusahaan), dikurangi potongan berkategori Gaji (mis. mangkir).
  const catOf = new Map(ctx.components.map((c) => [c.code, c.category]));
  const pensionCodes = new Set(["JHTK", "JPK", ...ctx.components.filter((c) => c.category === "IURAN_PENSIUN").map((c) => c.code)]);
  const gross = items.filter((i) => i.taxable && (i.kind === "PENDAPATAN" || i.kind === "BENEFIT")).reduce((a, i) => a + i.amount, 0)
    - items.filter((i) => i.kind === "POTONGAN" && catOf.get(i.code) === "GAJI").reduce((a, i) => a + i.amount, 0);
  const pension = items.filter((i) => pensionCodes.has(i.code)).reduce((a, i) => a + i.amount, 0);
  const lastMonth = ctx.period.endsWith("-12") || (resign !== null && resign <= end);
  let pph21 = 0, rate: number | null = null;
  if (components.some((c) => c.method === "PPH21")) {
    if (lastMonth) {
      const prior = ctx.priorLines.filter((l) => l.userId === userId);
      const priorPension = prior.reduce((a, l) => a + (l.items as LineItem[]).filter((i) => pensionCodes.has(i.code)).reduce((x, i) => x + i.amount, 0), 0);
      const months = prior.length + 1;
      const f = pph21Final({
        grossYear: prior.reduce((a, l) => a + l.gross, 0) + gross, pensionDeductYear: priorPension + pension, months,
        status: user?.ptkpStatus, withheld: prior.reduce((a, l) => a + l.pph21, 0), cfg: ctx.tax,
      });
      pph21 = f.tax;
      add("PPH21", "PPh Pasal 21", "POTONGAN", pph21, `hitung ulang setahun (${months} bulan), PTKP ${f.ptkp.toLocaleString("id-ID")}, PKP ${f.pkp.toLocaleString("id-ID")}`, false);
      // Kelebihan potong PPh 21 bulan-bulan sebelumnya dikembalikan ke karyawan (PMK 168/2023).
      add("PPHRF", "Pengembalian lebih potong PPh 21", "PENDAPATAN", f.refund, `pajak setahun ${f.yearTax.toLocaleString("id-ID")}, sudah dipotong ${Math.round(f.yearTax + f.refund).toLocaleString("id-ID")}`, false);
    } else {
      const t = pph21Monthly(gross, user?.ptkpStatus);
      pph21 = t.tax; rate = t.rate;
      add("PPH21", "PPh Pasal 21", "POTONGAN", pph21, `TER ${t.rate}% x ${Math.round(gross).toLocaleString("id-ID")} (${user?.ptkpStatus ?? "TK/0"})`, false);
    }
    if (!user?.ptkpStatus) warnings.push("Status PTKP kosong, dipakai TK/0");
  }

  const sum = (k: string) => items.filter((i) => i.kind === k).reduce((a, i) => a + i.amount, 0);
  const earnings = sum("PENDAPATAN"), deductions = sum("POTONGAN"), benefits = sum("BENEFIT");
  return {
    inputs, items, gross, earnings, deductions, benefits, pph21: round(pph21), netPay: earnings - deductions,
    ptkp: user?.ptkpStatus ?? null, terRate: rate, warning: warnings.join(" · ") || null,
  };
}

const toJson = (v: unknown) => v as Prisma.InputJsonValue;
// Hanya masukan manual admin yang dibawa saat dihitung ulang; angka otomatis diambil lagi dari data.
const manualOf = (raw: unknown): Partial<LineInputs> => {
  const n = normalizeInputs(raw);
  return { otWork: n.otWork, otRest: n.otRest };
};

// Buat atau hitung ulang draft satu periode untuk semua karyawan aktif. Jam lembur yang sudah diisi di draft
// dipertahankan. extraCodes = komponen tidak rutin (THR, bonus) yang disertakan periode ini.
export async function generateRun(period: string, extraCodes: string[], by: string | null) {
  const existing = await prisma.payrollRun.findUnique({ where: { period }, include: { lines: true } });
  if (existing?.status === "FINAL") throw new Error("Periode ini sudah final.");
  const run = existing
    ? await prisma.payrollRun.update({ where: { id: existing.id }, data: { extraCodes, includeThr: extraCodes.includes("THR") } })
    : await prisma.payrollRun.create({ data: { period, extraCodes, includeThr: extraCodes.includes("THR"), createdBy: by } });
  const ctx = await loadContext(period);
  const employees = await prisma.user.findMany({
    where: { role: { not: "SUPER_ADMIN" }, OR: [{ isActive: true }, { resignDate: { gte: ctx.start } }] },
    select: { id: true },
  });
  for (const e of employees) {
    const prev = existing?.lines.find((l) => l.userId === e.id)?.inputs;
    const r = await computeLine(ctx, e.id, extraCodes, prev ? manualOf(prev) : undefined);
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
  const prev = normalizeInputs(line.inputs);
  const merged: Partial<LineInputs> = { ...prev, ...override, values: { ...(prev.values ?? {}), ...(override.values ?? {}) } };
  const r = await computeLine(ctx, line.userId, line.run.extraCodes, merged);
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
