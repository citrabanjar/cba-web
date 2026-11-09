import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { evaluate, type PayContext, type PayParams, type PayrollSettings } from "@/lib/payroll";
import { getPayrollSettings, getTaxSettings, getTerSettings } from "@/lib/payroll-settings";
import { countLeaveDays } from "@/lib/leave-balance";
import { getShiftCalendar } from "@/lib/schedule";
import { dayPenalty } from "@/lib/attendance-penalty";
import { isWeekly, periodLabel } from "@/lib/payroll-run-period";
import { pph21Daily, pph21Final, pph21Monthly, taxYearConfig, terVersionAt } from "@/lib/pph21";

const DAY = 86_400_000;
const utc = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

// Masukan satu karyawan per periode. Angka otomatis (hadir, dinas, cuti) diambil dari data portal;
// jam lembur per pengajuan dan nilai komponen "input tiap periode" diisi admin di draft.
export type LineInputs = {
  workDays: number; daysPresent: number; absentDays: number;
  tripDays: number; trips: number; leaveDays: number; monthsOfService: number;
  unpaidLeaveDays?: number; // cuti jenis tanpa upah + bagian cuti yang melebihi saldo
  otWork: number[]; otRest: number[]; // jam lembur per pengajuan (hari kerja / hari libur)
  values: Record<string, number>; // nilai komponen input tiap periode, per kode (mis. BNS, KSB)
};
export type LineItem = { code: string; name: string; kind: string; amount: number; detail: string; taxable: boolean; refs?: string[] };

// Masukan lama (sebelum komponen fleksibel) dibaca ulang ke bentuk baru.
export function normalizeInputs(raw: unknown): Partial<LineInputs> {
  const r = (raw ?? {}) as Record<string, unknown>;
  const n = (v: unknown) => Math.max(0, Number(v) || 0);
  const arr = (v: unknown) => (Array.isArray(v) ? v.map(n).filter((x) => x > 0) : undefined);
  const out: Partial<LineInputs> = {};
  for (const k of ["workDays", "daysPresent", "absentDays", "tripDays", "trips", "leaveDays", "monthsOfService", "unpaidLeaveDays"] as const) if (r[k] !== undefined) out[k] = n(r[k]);
  out.otWork = arr(r.otWork) ?? (n(r.overtimeHours) ? [n(r.overtimeHours)] : []);
  out.otRest = arr(r.otRest) ?? (n(r.restOvertimeHours) ? [n(r.restOvertimeHours)] : []);
  const values: Record<string, number> = {};
  if (r.values && typeof r.values === "object") for (const [k, v] of Object.entries(r.values as Record<string, unknown>)) if (n(v)) values[k] = n(v);
  if (n(r.bonus) && values.BNS === undefined) values.BNS = n(r.bonus);
  if (n(r.kasbon) && values.KSB === undefined) values.KSB = n(r.kasbon);
  out.values = values;
  return out;
}

export { isWeekly, periodLabel, weekStartOf } from "@/lib/payroll-run-period";
const iso = (d: Date) => d.toISOString().slice(0, 10);

// Rentang tanggal periode gaji. Mingguan: 7 hari dari tanggal mulai. Bulanan: periodStartDay 1 = sebulan
// kalender; 21 = 21 bulan lalu s/d 20 bulan ini.
export function periodRange(period: string, s: PayrollSettings) {
  if (isWeekly(period)) {
    const start = new Date(`${period}T00:00:00Z`);
    return { start, end: new Date(start.getTime() + 6 * DAY) };
  }
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
  const weekly = isWeekly(period);
  const year = Number(iso(end).slice(0, 4));
  // Mingguan: komponen bulanan (input profil, flat, BPJS/persen) dibayar di minggu yang memuat akhir bulan.
  let monthEnd = false;
  // Angsuran pinjaman per bulan: proses bulanan = periodenya; mingguan = bulan yang berakhir di minggu itu.
  let loanPeriod: string | null = weekly ? null : period;
  for (let t = start.getTime(); t <= end.getTime(); t += DAY) {
    if (new Date(t + DAY).getUTCDate() === 1) { monthEnd = true; if (weekly) loanPeriod = iso(new Date(t)).slice(0, 7); }
  }
  const [components, priorLines, taxAll, terAll] = await Promise.all([
    prisma.payComponent.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" }, include: { employees: { select: { userId: true, startDate: true, endDate: true } } } }),
    // Gaji final bulan-bulan sebelumnya di tahun yang sama (untuk hitung ulang PPh 21 Desember).
    weekly ? Promise.resolve([]) : prisma.payrollLine.findMany({
      where: { run: { status: "FINAL", frequency: "BULANAN", period: { gte: `${year}-01`, lt: period } } },
      select: { userId: true, gross: true, pph21: true, items: true },
    }),
    getTaxSettings(),
    getTerSettings(),
  ]);
  return {
    period, settings, start, end, year, weekly, monthEnd: !weekly || monthEnd, loanPeriod, components, priorLines,
    tax: taxYearConfig(taxAll, year), ter: terVersionAt(terAll, iso(end)),
  };
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
    prisma.user.findUnique({ where: { id: userId }, select: { joinDate: true, resignDate: true, ptkpStatus: true, taxability: true } }),
    prisma.employeeSalary.findFirst({ where: { userId, effectiveDate: { lte: end } }, orderBy: { effectiveDate: "desc" }, include: { components: true } }),
    prisma.businessTrip.findMany({ where: { userId, status: "APPROVED", startDate: { lte: end }, endDate: { gte: start } }, select: { startDate: true, endDate: true } }),
    prisma.leaveRequest.findMany({
      where: { userId, status: "APPROVED", startDate: { lte: end }, endDate: { gte: start } },
      select: { startDate: true, endDate: true, halfDay: true, unpaidDays: true, policy: { select: { paid: true } } },
    }),
  ]);
  const join = user?.joinDate ? utc(user.joinDate) : null;
  const from = join && join > start ? join : start;
  const resign = user?.resignDate ? utc(user.resignDate) : null;
  const to = resign && resign < end ? resign : end;
  const clip = (a: Date, b: Date) => ({ a: utc(a) < start ? start : utc(a), b: utc(b) > end ? end : utc(b) });

  // Hari cuti disetujui di rentang [a, b]: setengah hari = 0,5. "unpaid" = cuti jenis tanpa upah
  // ditambah bagian yang melebihi saldo (dicatat di periode tanggal akhir cutinya).
  const leaveQty = async (a0: Date, b0: Date) => {
    let all = 0, unpaid = 0;
    for (const l of leaves) {
      const a = utc(l.startDate) < a0 ? a0 : utc(l.startDate), b = utc(l.endDate) > b0 ? b0 : utc(l.endDate);
      if (a > b) continue;
      const days = l.halfDay ? 0.5 : await countLeaveDays(userId, a, b, "HARI_KERJA");
      all += days;
      if (l.policy && !l.policy.paid) unpaid += days;
      else if (l.unpaidDays > 0 && utc(l.endDate) <= b0) unpaid += Math.min(l.unpaidDays, days);
    }
    return { all, unpaid };
  };

  // Terlambat / pulang cepat per hari dari jam absen dibanding jam shift.
  const [attTimes, shiftCal] = await Promise.all([
    prisma.attendance.findMany({ where: { userId, date: { gte: start, lte: end }, checkIn: { not: null } }, select: { date: true, checkIn: true, checkOut: true } }),
    getShiftCalendar(userId, start, end),
  ]);
  const penalties = attTimes.map((a) => {
    const k = a.date.toISOString().slice(0, 10);
    return { t: utc(a.date).getTime(), p: dayPenalty(shiftCal[k], k, a.checkIn, a.checkOut) };
  });
  const penaltyQty = (a: Date, b: Date) => {
    const in_ = penalties.filter((x) => x.p && x.t >= a.getTime() && x.t <= b.getTime()).map((x) => x.p!);
    const late = in_.reduce((s2, p) => s2 + p.lateHours, 0), early = in_.reduce((s2, p) => s2 + p.earlyHours, 0);
    return { JAM_TERLAMBAT: late, JAM_PULANG_CEPAT: early, JAM_TELAT_PULANG_CEPAT: late + early, KALI_TERLAMBAT: in_.filter((p) => p.late).length };
  };

  // Masukan otomatis: hari kerja dari jadwal, hadir/mangkir dari absensi, dinas & cuti yang disetujui.
  const tripDates = new Set<number>();
  for (const t of trips) { const { a, b } = clip(t.startDate, t.endDate); for (let d = a.getTime(); d <= b.getTime(); d += DAY) tripDates.add(d); }
  const [workDaysFull, workDaysHere, att, leaveDays] = await Promise.all([
    countLeaveDays(userId, start, end, "HARI_KERJA"),
    from <= to ? countLeaveDays(userId, from, to, "HARI_KERJA") : Promise.resolve(0),
    prisma.attendance.groupBy({ by: ["status"], where: { userId, date: { gte: start, lte: end } }, _count: { _all: true } }),
    leaveQty(start, end).then((q) => q.all),
  ]);
  const unpaidLeaveDays = (await leaveQty(start, end)).unpaid;
  const count = (st: string[]) => att.filter((a) => st.includes(a.status)).reduce((n, a) => n + a._count._all, 0);
  const inputs: LineInputs = {
    workDays: workDaysFull, daysPresent: count(["HADIR", "DINAS"]), absentDays: count(["ALPHA"]),
    tripDays: tripDates.size, trips: trips.filter((t) => utc(t.startDate) >= start).length, leaveDays, unpaidLeaveDays,
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

  // Karyawan harian (payroll mingguan): gaji bulanan = gaji harian x pengali (dasar lembur, BPJS, THR).
  const weekly = ctx.weekly;
  const daily = salary?.dailyWage ?? 0, monthlyFactor = salary?.monthlyFactor ?? 0;
  if (weekly && salary && !(daily > 0 && monthlyFactor > 0)) warnings.push("Gaji harian / pengali belum diisi");
  const basicFull = weekly && daily > 0 && monthlyFactor > 0 ? daily * monthlyFactor : salary?.basicSalary ?? 0;
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
  // Mingguan: gaji pokok sudah = gaji harian x hari kerja terjadwal, jadi tidak diprorata lagi.
  const factor = weekly ? 1 : s.prorate === "HARI_KALENDER" ? calHere / calDays : workDaysFull ? workDaysHere / workDaysFull : 1;
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
          leaveQty(w.a, w.b),
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
              ...base.qty, HARI_HADIR: cnt(["HADIR", "DINAS"]), HARI_MANGKIR: cnt(["ALPHA"]), HARI_CUTI: leaveW.all, HARI_CUTI_TANPA_UPAH: leaveW.unpaid, HARI_DINAS: dates,
              ...penaltyQty(w.a, w.b),
              KALI_DINAS: trips.filter((t) => utc(t.startDate) >= w.a && utc(t.startDate) <= w.b).length,
            },
          },
        };
      })());
    }
    return windowCache.get(key)!.then((r) => ({ ...r, label: `berlaku ${fmt(w.a)} - ${fmt(w.b)}` }));
  };

  // Nilai komponen input: GP dari gaji pokok, tetap dari profil (pakai kode), tiap periode dari draft.
  const values: Record<string, number> = { GP: basicFull };
  for (const x of [...allowances, ...fixedDeductions]) if (x.code) values[x.code] = (values[x.code] ?? 0) + x.amount;
  for (const c of components) if (c.method === "NOMINAL") values[c.code] = (values[c.code] ?? 0) + (c.amount ?? 0);
  const pctx: PayContext = {
    values, fixedTotal, bpjsTk: salary?.bpjsTkBase ?? fixedTotal, bpjsKes: salary?.bpjsKesBase ?? fixedTotal,
    qty: {
      HARI_HADIR: inputs.daysPresent, HARI_MANGKIR: inputs.absentDays, HARI_KERJA: inputs.workDays, MASA_KERJA: inputs.monthsOfService,
      HARI_DINAS: inputs.tripDays, KALI_DINAS: inputs.trips, HARI_CUTI: inputs.leaveDays, HARI_CUTI_TANPA_UPAH: inputs.unpaidLeaveDays ?? 0,
      ...penaltyQty(start, end),
    },
    periodDays: calDays,
    overtimeWork: inputs.otWork, overtimeRest: inputs.otRest, workDaysPerWeek: s.workDaysPerWeek, overtimeDivisor: s.overtimeDivisor, nonRoutine,
    prorataDays: weekly && monthlyFactor > 0 ? monthlyFactor : undefined,
  };
  const monthlyItem = (c: { method: string; code: string }) => c.method === "NOMINAL" || c.method === "PERSEN" || (c.method === "INPUT" && c.code !== "GP");

  const used = new Set<string>();
  const join2 = (...x: string[]) => x.filter(Boolean).join(" · ");
  for (const c of components) {
    const params = (c.params ?? null) as PayParams | null;
    const earning = c.kind === "PENDAPATAN";
    if (c.method === "PPH21") continue;
    used.add(c.code);
    if (weekly && !ctx.monthEnd && monthlyItem(c)) continue;
    if (weekly && c.code === "GP") {
      add(c.code, c.name, c.kind, daily * workDaysHere, `${Math.round(daily).toLocaleString("id-ID")} x ${workDaysHere} hari kerja terjadwal`, c.taxable);
      continue;
    }
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
    if (!ctx.monthEnd) return;
    const m = a.code ? master.get(a.code) : undefined;
    add(a.code && !items.some((x) => x.code === a.code) ? a.code : `TJ${i + 1}`, a.name, "PENDAPATAN", prorate(a.amount), "tunjangan tetap karyawan", m?.taxable ?? true);
  });
  fixedDeductions.forEach((d, i) => {
    if (d.code && (used.has(d.code) || master.has(d.code))) return;
    if (!ctx.monthEnd) return;
    const m = d.code ? master.get(d.code) : undefined;
    add(d.code && !items.some((x) => x.code === d.code) ? d.code : `PT${i + 1}`, d.name, "POTONGAN", d.amount, "potongan tetap karyawan", m?.taxable ?? false);
  });

  // Angsuran pinjaman karyawan periode ini (bukan objek pajak). Ditandai terpotong saat gaji difinalkan.
  if (ctx.loanPeriod) {
    // Hanya pinjaman yang sudah dicairkan (BERJALAN); satu baris per pinjaman supaya terlihat terpisah di slip.
    const inst = await prisma.loanInstallment.findMany({
      where: { period: ctx.loanPeriod, status: "BELUM", loan: { userId, status: "BERJALAN" } },
      include: { loan: { select: { tenor: true, seqNo: true, id: true } } }, orderBy: [{ loan: { seqNo: "asc" } }, { seq: "asc" }],
    });
    const byLoan = new Map<string, typeof inst>();
    for (const i of inst) byLoan.set(i.loan.id, [...(byLoan.get(i.loan.id) ?? []), i]);
    for (const list of byLoan.values()) {
      const total = list.reduce((a, i) => a + i.amount, 0);
      const no = list[0].loan.seqNo ?? 0;
      if (total > 0) {
        items.push({
          code: `PJM${no || ""}`, name: no ? `Angsuran Pinjaman ke-${no}` : "Angsuran Pinjaman", kind: "POTONGAN", amount: round(total), taxable: false,
          detail: list.map((i) => `angsuran ${i.seq} dari ${i.loan.tenor}`).join(", "), refs: list.map((i) => i.id),
        });
      }
    }
  }

  // PPh 21: bruto = pendapatan + benefit objek pajak (premi asuransi perusahaan), dikurangi potongan berkategori Gaji (mis. mangkir).
  const catOf = new Map(ctx.components.map((c) => [c.code, c.category]));
  const reduces = new Set(ctx.components.filter((c) => (c.params as PayParams | null)?.reducesGross).map((c) => c.code));
  const pensionCodes = new Set(["JHTK", "JPK", ...ctx.components.filter((c) => c.category === "IURAN_PENSIUN").map((c) => c.code)]);
  let gross = items.filter((i) => i.taxable && (i.kind === "PENDAPATAN" || i.kind === "BENEFIT")).reduce((a, i) => a + i.amount, 0)
    - items.filter((i) => i.kind === "POTONGAN" && (catOf.get(i.code) === "GAJI" || reduces.has(i.code))).reduce((a, i) => a + i.amount, 0);
  const pension = items.filter((i) => pensionCodes.has(i.code)).reduce((a, i) => a + i.amount, 0);
  const lastMonth = !weekly && (ctx.period.endsWith("-12") || (resign !== null && resign <= end));
  const prior = ctx.priorLines.filter((l) => l.userId === userId);
  const priorPension = prior.reduce((a, l) => a + (l.items as LineItem[]).filter((i) => pensionCodes.has(i.code)).reduce((x, i) => x + i.amount, 0), 0);
  const months = prior.length + 1;
  // PPh 21 atas bruto tertentu: TER harian (mingguan), hitung ulang setahun (masa pajak terakhir), atau TER bulanan.
  const taxOf = (g: number) => {
    if (weekly) {
      const t = pph21Daily(g, workDaysHere, ctx.ter);
      return { tax: t.tax, rate: t.rate as number | null, refund: 0, detail: `TER harian ${t.rate}% · rata-rata ${Math.round(t.perDay).toLocaleString("id-ID")} sehari`, refundDetail: "" };
    }
    if (lastMonth) {
      const f = pph21Final({
        grossYear: prior.reduce((a, l) => a + l.gross, 0) + g, pensionDeductYear: priorPension + pension, months,
        status: user?.ptkpStatus, withheld: prior.reduce((a, l) => a + l.pph21, 0), cfg: ctx.tax,
      });
      return {
        tax: f.tax, rate: null as number | null, refund: f.refund,
        detail: `hitung ulang setahun (${months} bulan), PTKP ${f.ptkp.toLocaleString("id-ID")}, PKP ${f.pkp.toLocaleString("id-ID")}`,
        refundDetail: `pajak setahun ${f.yearTax.toLocaleString("id-ID")}, sudah dipotong ${Math.round(f.yearTax + f.refund).toLocaleString("id-ID")}`,
      };
    }
    const t = pph21Monthly(g, user?.ptkpStatus, ctx.ter);
    return { tax: t.tax, rate: t.rate as number | null, refund: 0, detail: `TER ${t.rate}% x ${Math.round(g).toLocaleString("id-ID")} (${user?.ptkpStatus ?? "TK/0"})`, refundDetail: "" };
  };
  let pph21 = 0, rate: number | null = null;
  if (components.some((c) => c.method === "PPH21")) {
    // Metode pajak per karyawan (isian Taxability di profil): Gross = dipotong dari gaji; Gross Up = perusahaan
    // memberi Tunjangan PPh sebesar pajaknya; Net = pajak ditanggung perusahaan tanpa tunjangan.
    const method = (user?.taxability ?? "Gross").toLowerCase().replace(/[\s-]/g, "");
    let t = taxOf(gross);
    if (method === "grossup" && t.tax > 0) {
      // Cari tunjangan T sehingga T = PPh 21 atas (bruto + T).
      let allowance = t.tax;
      for (let i = 0; i < 50; i++) {
        const next = taxOf(gross + allowance).tax;
        if (next === allowance) break;
        allowance = i < 40 ? next : Math.max(next, allowance);
      }
      add("TPPH", "Tunjangan PPh 21", "PENDAPATAN", allowance, "gross up: ditanggung perusahaan", true);
      gross += round(allowance);
      t = taxOf(gross);
    }
    pph21 = t.tax; rate = t.rate;
    if (method === "net") add("PPH21", "PPh Pasal 21 (ditanggung perusahaan)", "BENEFIT", pph21, t.detail, false);
    else add("PPH21", "PPh Pasal 21", "POTONGAN", pph21, t.detail, false);
    // Kelebihan potong PPh 21 bulan-bulan sebelumnya dikembalikan ke karyawan (PMK 168/2023).
    if (t.refund && method === "gross") add("PPHRF", "Pengembalian lebih potong PPh 21", "PENDAPATAN", t.refund, t.refundDetail, false);
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
    : await prisma.payrollRun.create({
        data: { period, extraCodes, includeThr: extraCodes.includes("THR"), frequency: isWeekly(period) ? "MINGGUAN" : "BULANAN", createdBy: by },
      });
  const ctx = await loadContext(period);
  // Jadwal bayar di profil karyawan menentukan ikut proses bulanan atau mingguan.
  const employees = await prisma.user.findMany({
    where: {
      role: { not: "SUPER_ADMIN" }, OR: [{ isActive: true }, { resignDate: { gte: ctx.start } }],
      AND: [ctx.weekly ? { paymentSchedule: "Mingguan" } : { OR: [{ paymentSchedule: null }, { paymentSchedule: { not: "Mingguan" } }] }],
    },
    select: { id: true },
  });
  // Karyawan yang tidak lagi ikut periode ini (mis. jadwal bayar berubah) dikeluarkan dari draft.
  await prisma.payrollLine.deleteMany({ where: { runId: run.id, userId: { notIn: employees.map((e) => e.id) } } });
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
      otherBenefits: otherEarn, pph21: items.filter((i) => i.code === "PPH21" && i.kind === "POTONGAN").reduce((a, i) => a + i.amount, 0), bpjsKesehatan: pick("KESK"), bpjsKetenagakerjaan: pick("JHTK", "JPK"),
      otherDeductions: otherDed, netPay: l.netPay,
    };
    return prisma.payslip.upsert({
      where: { userId_period: { userId: l.userId, period: run.period } },
      update: data, create: { ...data, userId: l.userId, period: run.period },
    });
  });
  // Angsuran pinjaman yang ikut terpotong ditandai lunas; pinjaman tanpa sisa angsuran menjadi LUNAS.
  const refs = run.lines.flatMap((l) => (l.items as LineItem[]).filter((i) => i.code.startsWith("PJM")).flatMap((i) => i.refs ?? []));
  const paidAt = new Date();
  await prisma.$transaction([
    ...ops,
    prisma.loanInstallment.updateMany({ where: { id: { in: refs }, status: "BELUM" }, data: { status: "LUNAS", paidRunId: runId, paidAt } }),
    prisma.payrollRun.update({ where: { id: runId }, data: { status: "FINAL", finalizedBy: by, finalizedAt: paidAt } }),
  ]);
  if (refs.length) {
    const loans = await prisma.employeeLoan.findMany({
      where: { status: "BERJALAN", installments: { some: { id: { in: refs } } } }, select: { id: true, installments: { select: { status: true } } },
    });
    const done = loans.filter((l) => l.installments.every((i) => i.status === "LUNAS")).map((l) => l.id);
    if (done.length) await prisma.employeeLoan.updateMany({ where: { id: { in: done } }, data: { status: "LUNAS" } });
  }
  return ops.length;
}
