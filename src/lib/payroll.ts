// Label, setelan bawaan, dan mesin rumus komponen payroll. Aman dipakai di server dan browser.
//
// Komponen = kolom hasil saat payroll run. Nilainya:
// - INPUT: diisi admin (tetap di profil karyawan, atau tiap periode di Proses Gaji), atau
// - RUMUS: cara hitung + parameter data (jam lembur, hari dinas, hari hadir, masa kerja, nilai komponen lain).

export const PAY_KINDS = [
  { key: "PENDAPATAN", label: "Pendapatan" },
  { key: "POTONGAN", label: "Potongan" },
  { key: "BENEFIT", label: "Benefit (ditanggung perusahaan)" },
] as const;

export const PAY_CATEGORIES = [
  { key: "GAJI_POKOK", label: "Gaji Pokok" },
  { key: "TUNJANGAN_TETAP", label: "Tunjangan Tetap" },
  { key: "TUNJANGAN_TIDAK_TETAP", label: "Tunjangan Tidak Tetap" },
  { key: "LEMBUR", label: "Lembur" },
  { key: "THR", label: "THR" },
  { key: "BONUS", label: "Bonus / Insentif" },
  { key: "BPJS_TK", label: "BPJS Ketenagakerjaan" },
  { key: "BPJS_KES", label: "BPJS Kesehatan" },
  { key: "PAJAK", label: "Pajak" },
  { key: "POTONGAN_LAIN", label: "Potongan Lain" },
] as const;

// Cara hitung. INPUT = nilai diisi; sisanya rumus.
export const PAY_METHODS = [
  { key: "INPUT", label: "Input nilai", hint: "Nilai diisi admin: tetap di profil karyawan, atau tiap periode di Proses Gaji." },
  { key: "NOMINAL", label: "Nominal sama untuk semua", hint: "Satu nominal per bulan untuk semua karyawan yang ditempel." },
  { key: "PER_SATUAN", label: "Nominal x jumlah parameter", hint: "Contoh: uang saku dinas Rp100.000 x hari dinas." },
  { key: "KELIPATAN", label: "Nominal per kelipatan parameter", hint: "Contoh: uang makan lembur Rp15.000 tiap kelipatan 4 jam per pengajuan, minimal 4 jam." },
  { key: "PERSEN", label: "Persen dari dasar nilai", hint: "Contoh: BPJS 1% x upah, dengan batas atas/bawah." },
  { key: "PRORATA", label: "Dasar nilai / hari kerja x parameter", hint: "Contoh: potongan mangkir = upah / hari kerja x hari mangkir." },
  { key: "LEMBUR", label: "Upah lembur (PP 35/2021)", hint: "Dasar nilai / 173 x pengali jam lembur." },
  { key: "THR", label: "THR (Permenaker 6/2016)", hint: "Dasar nilai x bulan upah, proporsional bila masa kerja < 12 bulan." },
  { key: "PPH21", label: "PPh 21 (TER)", hint: "Dihitung otomatis dari bruto dan status PTKP." },
] as const;

// Parameter data yang bisa dipakai rumus.
export const PAY_PARAMS = [
  { key: "JAM_LEMBUR", label: "Jam lembur (per pengajuan)", unit: "jam" },
  { key: "HARI_DINAS", label: "Hari dinas luar", unit: "hari" },
  { key: "KALI_DINAS", label: "Kegiatan dinas luar (kali)", unit: "kali" },
  { key: "HARI_HADIR", label: "Hari hadir", unit: "hari" },
  { key: "HARI_MANGKIR", label: "Hari mangkir", unit: "hari" },
  { key: "HARI_CUTI", label: "Hari cuti disetujui", unit: "hari" },
  { key: "HARI_KERJA", label: "Hari kerja sebulan", unit: "hari" },
  { key: "MASA_KERJA", label: "Masa kerja", unit: "bulan" },
] as const;
export const NEEDS_PARAM = ["PER_SATUAN", "KELIPATAN", "PRORATA"];
export const NEEDS_BASE = ["PERSEN", "PRORATA", "LEMBUR", "THR"];

export const PAY_BASES = [
  { key: "GAJI_POKOK", label: "Gaji pokok" },
  { key: "UPAH_TETAP", label: "Gaji pokok + tunjangan tetap" },
  { key: "UPAH_BPJS", label: "Upah BPJS" },
  { key: "KOMPONEN", label: "Komponen yang dicentang" },
] as const;

export type OvertimeParams = { divisor: number; workday: [number, number]; rest6: [number, number, number]; rest5: [number, number, number] };
export type PayParams = {
  divisor?: number; workday?: number[]; rest6?: number[]; rest5?: number[]; months?: number;
  min?: number; // batas minimal parameter (KELIPATAN)
  perPeriod?: boolean; // INPUT diisi tiap periode di Proses Gaji
};
export const DEFAULT_OVERTIME: OvertimeParams = { divisor: 173, workday: [1.5, 2], rest6: [2, 3, 4], rest5: [2, 3, 4] };

// Ketentuan undang-undang untuk peringatan bila angkanya diubah.
const LEGAL_RATES: Record<string, { rate?: number; min?: number; max?: number; source: string }> = {
  JHTP: { rate: 3.7, source: "PP 46/2015" }, JHTK: { rate: 2, source: "PP 46/2015" },
  JKK: { min: 0.24, max: 1.74, source: "PP 44/2015" }, JKM: { rate: 0.3, source: "PP 44/2015" },
  JPP: { rate: 2, source: "PP 45/2015" }, JPK: { rate: 1, source: "PP 45/2015" },
  KESP: { rate: 4, source: "Perpres 64/2020" }, KESK: { rate: 1, source: "Perpres 64/2020" },
};
export function legalWarning(c: { code: string; method: string; rate: number | null; params?: PayParams | null }): string | null {
  const l = LEGAL_RATES[c.code];
  if (l && c.rate !== null && c.method === "PERSEN") {
    if (l.rate !== undefined && c.rate !== l.rate) return `Berbeda dari ketentuan ${l.source} (${String(l.rate).replace(".", ",")}%)`;
    if (l.min !== undefined && (c.rate < l.min || c.rate > (l.max ?? Infinity))) return `Di luar rentang ${l.source} (${l.min}–${l.max}%)`;
  }
  const p = c.params ?? {};
  if (c.method === "LEMBUR") {
    const same = (a: number[] | undefined, b: number[]) => !!a && a.length === b.length && a.every((x, i) => x === b[i]);
    if (p.divisor !== 173 || !same(p.workday, DEFAULT_OVERTIME.workday) || !same(p.rest6, DEFAULT_OVERTIME.rest6) || !same(p.rest5, DEFAULT_OVERTIME.rest5)) {
      return "Berbeda dari ketentuan PP 35/2021 (1/173; 1,5x lalu 2x; libur 2x/3x/4x)";
    }
  }
  if (c.method === "THR" && p.months !== undefined && p.months < 1) return "Di bawah ketentuan Permenaker 6/2016 (1 bulan upah)";
  return null;
}

const find = <T extends { key: string; label: string }>(list: readonly T[], k: string | null | undefined) =>
  list.find((x) => x.key === k)?.label ?? k ?? "";
export const kindLabel = (k: string) => find(PAY_KINDS, k);
export const categoryLabel = (k: string) => find(PAY_CATEGORIES, k);
export const methodLabel = (k: string) => find(PAY_METHODS, k);
export const baseLabel = (k: string | null) => find(PAY_BASES, k);
export const paramLabel = (k: string | null) => find(PAY_PARAMS, k);
export const paramUnit = (k: string | null) => PAY_PARAMS.find((p) => p.key === k)?.unit ?? "";
export const isOneOf = (list: readonly { key: string }[], k: string | null | undefined) => list.some((x) => x.key === k);

export type PayComponentInput = {
  code: string; name: string; kind: string; category: string; method: string; param: string | null;
  amount: number | null; rate: number | null; base: string | null; capAmount: number | null; floorAmount: number | null;
  params: PayParams | null; baseCodes: string[];
  taxable: boolean; legalBasis: string; note: string; isActive: boolean;
};

// Setelan umum payroll (disimpan di AppSetting "payroll.settings").
export type PayrollSettings = {
  region: string; umk: number; ump: number;
  periodStartDay: number; // tanggal mulai periode gaji (1 = sebulan kalender)
  payDay: number; // tanggal gajian (0 = hari kerja terakhir bulan itu)
  overtimeDivisor: number; // pembagi upah sejam lembur
  workDaysPerWeek: 5 | 6; // dipakai untuk pengali lembur hari istirahat
  prorate: "HARI_KERJA" | "HARI_KALENDER"; // gaji karyawan masuk/keluar di tengah periode
  rounding: number; // pembulatan rupiah (1, 100, 1000)
};

export const PAYROLL_SETTING_KEY = "payroll.settings";
export const DEFAULT_PAYROLL_SETTINGS: PayrollSettings = {
  region: "Kota Banjarmasin", umk: 3855894, ump: 3725000,
  periodStartDay: 1, payDay: 0, overtimeDivisor: 173, workDaysPerWeek: 6, prorate: "HARI_KERJA", rounding: 1,
};

export const rupiah = (n: number) => `Rp${Math.round(n).toLocaleString("id-ID")}`;
const num = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");

// Upah lembur (PP 35/2021) dengan pengali dari komponen.
export function overtimePay(hourly: number, workdayHours: number, restHours: number, workDaysPerWeek: 5 | 6, params?: PayParams | null) {
  const p = { ...DEFAULT_OVERTIME, ...(params ?? {}) } as OvertimeParams;
  const [w1, w2] = p.workday;
  const w = Math.min(1, workdayHours) * w1 + Math.max(0, workdayHours - 1) * w2;
  const [r1, r2, r3] = workDaysPerWeek === 6 ? p.rest6 : p.rest5;
  const a = workDaysPerWeek === 6 ? 7 : 8; // pengali pertama sampai jam ke-a, jam berikutnya pengali kedua, sisanya ketiga
  const r = Math.min(restHours, a) * r1 + Math.min(Math.max(restHours - a, 0), 1) * r2 + Math.max(restHours - a - 1, 0) * r3;
  return hourly * (w + r);
}

// Data satu karyawan dalam satu periode yang dipakai rumus.
export type PayContext = {
  values: Record<string, number>; // nilai komponen INPUT per kode (GP = gaji pokok)
  fixedTotal: number; // gaji pokok + tunjangan tetap
  bpjsTk: number; bpjsKes: number;
  qty: Record<string, number>; // jumlah per parameter (HARI_HADIR, HARI_DINAS, MASA_KERJA, ...)
  overtimeWork: number[]; overtimeRest: number[]; // jam lembur per pengajuan (hari kerja / hari libur)
  workDaysPerWeek: 5 | 6; overtimeDivisor: number; includeThr: boolean;
};

type EvalComponent = Pick<PayComponentInput, "code" | "name" | "kind" | "category" | "method" | "param" | "amount" | "rate" | "base" | "capAmount" | "floorAmount" | "params" | "baseCodes">;

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

export function baseValue(c: EvalComponent, ctx: PayContext) {
  if (c.base === "GAJI_POKOK") return ctx.values.GP ?? 0;
  if (c.base === "UPAH_BPJS") return c.category === "BPJS_KES" ? ctx.bpjsKes : ctx.bpjsTk;
  if (c.base === "KOMPONEN") return c.baseCodes.reduce((x, code) => x + (ctx.values[code] ?? 0), 0);
  return ctx.fixedTotal;
}

// Jumlah parameter. Jam lembur = semua pengajuan (hari kerja + hari libur).
export function paramTotal(param: string | null, ctx: PayContext) {
  if (param === "JAM_LEMBUR") return sum(ctx.overtimeWork) + sum(ctx.overtimeRest);
  return ctx.qty[param ?? ""] ?? 0;
}

// Hitung satu komponen rumus. INPUT dan PPh 21 ditangani pemanggil.
export function evaluate(c: EvalComponent, ctx: PayContext): { amount: number; detail: string } | null {
  const p = c.params ?? {};
  switch (c.method) {
    case "NOMINAL": return { amount: c.amount ?? 0, detail: "nominal per bulan" };
    case "PER_SATUAN": {
      const q = paramTotal(c.param, ctx);
      return { amount: (c.amount ?? 0) * q, detail: `${rupiah(c.amount ?? 0)} x ${num(q)} ${paramUnit(c.param)}` };
    }
    case "KELIPATAN": {
      const step = c.rate ?? 0, min = p.min ?? step;
      const occ = c.param === "JAM_LEMBUR" ? [...ctx.overtimeWork, ...ctx.overtimeRest] : [paramTotal(c.param, ctx)];
      const times = step > 0 ? occ.filter((q) => q >= min).reduce((x, q) => x + Math.floor(q / step + 1e-9), 0) : 0;
      return { amount: (c.amount ?? 0) * times, detail: `${rupiah(c.amount ?? 0)} x ${times} (kelipatan ${num(step)} ${paramUnit(c.param)}, min ${num(min)})` };
    }
    case "PERSEN": {
      let b = baseValue(c, ctx);
      if (c.floorAmount) b = Math.max(b, c.floorAmount);
      if (c.capAmount) b = Math.min(b, c.capAmount);
      return { amount: (b * (c.rate ?? 0)) / 100, detail: `${num(c.rate ?? 0)}% x ${rupiah(b)}` };
    }
    case "PRORATA": {
      const days = ctx.qty.HARI_KERJA || 0, q = paramTotal(c.param, ctx), b = baseValue(c, ctx);
      return { amount: days ? (b / days) * q : 0, detail: `${rupiah(b)} / ${days} hari x ${num(q)} ${paramUnit(c.param)}` };
    }
    case "LEMBUR": {
      const hourly = baseValue(c, ctx) / (p.divisor ?? ctx.overtimeDivisor);
      const w = sum(ctx.overtimeWork), r = sum(ctx.overtimeRest);
      // Pengali dihitung per pengajuan supaya jam pertama tiap lembur hari kerja tetap 1,5x.
      const amount = ctx.overtimeWork.reduce((x, h) => x + overtimePay(hourly, h, 0, ctx.workDaysPerWeek, p), 0)
        + ctx.overtimeRest.reduce((x, h) => x + overtimePay(hourly, 0, h, ctx.workDaysPerWeek, p), 0);
      return { amount, detail: `upah sejam ${rupiah(hourly)} · ${num(w)} jam hari kerja, ${num(r)} jam hari libur` };
    }
    case "THR": {
      if (!ctx.includeThr) return null;
      const m = ctx.qty.MASA_KERJA ?? 0, k = p.months ?? 1, b = baseValue(c, ctx);
      return { amount: m >= 12 ? b * k : m >= 1 ? (b * k * m) / 12 : 0, detail: m >= 12 ? `${num(k)} bulan upah` : `${m}/12 x ${num(k)} bulan upah` };
    }
    default: return null;
  }
}

// Kalimat ringkas rumus untuk kartu komponen.
export function describe(c: EvalComponent & { params?: PayParams | null }) {
  const p = c.params ?? {};
  const b = c.base === "KOMPONEN" ? (c.baseCodes.length ? c.baseCodes.join(" + ") : "komponen belum dipilih") : baseLabel(c.base ?? "UPAH_TETAP");
  switch (c.method) {
    case "INPUT": return p.perPeriod ? "Input tiap periode (Proses Gaji)" : "Input tetap per karyawan (profil)";
    case "NOMINAL": return `${rupiah(c.amount ?? 0)} per bulan`;
    case "PER_SATUAN": return `${rupiah(c.amount ?? 0)} x ${paramLabel(c.param)}`;
    case "KELIPATAN": return `${rupiah(c.amount ?? 0)} tiap kelipatan ${num(c.rate ?? 0)} ${paramUnit(c.param)} (${paramLabel(c.param)}, min ${num(p.min ?? c.rate ?? 0)})`;
    case "PERSEN": {
      const extra = [c.floorAmount ? `min ${rupiah(c.floorAmount)}` : "", c.capAmount ? `maks ${rupiah(c.capAmount)}` : ""].filter(Boolean).join(", ");
      return `${num(c.rate ?? 0)}% x ${b}${extra ? ` (${extra})` : ""}`;
    }
    case "PRORATA": return `${b} / hari kerja x ${paramLabel(c.param)}`;
    case "LEMBUR": return `1/${p.divisor ?? 173} x ${b} · ${(p.workday ?? []).map(num).join("x / ")}x · libur ${(p.rest6 ?? []).map(num).join("x / ")}x`;
    case "THR": return `${num(p.months ?? 1)} bulan x ${b}`;
    case "PPH21": return "PPh 21 TER otomatis";
    default: return methodLabel(c.method);
  }
}

// Simulasi gaji satu karyawan (tanpa PPh 21) memakai mesin rumus yang sama dengan payroll run.
export type SimInput = {
  basic: number; fixedAllowance: number; bpjsBase: number | null; daysPresent: number; absentDays: number; workDaysInMonth: number;
  monthsOfService: number; overtimeWork: number[]; overtimeRest: number[]; tripDays: number; trips: number; leaveDays: number;
};
export type SimLine = { code: string; name: string; kind: string; amount: number; detail: string };
export function simulate(components: (EvalComponent & { isActive: boolean })[], s: PayrollSettings, input: SimInput) {
  const round = (n: number) => Math.round(n / s.rounding) * s.rounding;
  const values: Record<string, number> = { GP: input.basic };
  const fixedInput = components.find((c) => c.isActive && c.method === "INPUT" && c.category === "TUNJANGAN_TETAP");
  if (fixedInput) values[fixedInput.code] = input.fixedAllowance;
  const active = components.filter((c) => c.isActive);
  for (const c of active) if (c.method === "NOMINAL") values[c.code] = c.amount ?? 0;
  const fixedTotal = input.basic + input.fixedAllowance
    + active.filter((c) => c.method === "NOMINAL" && c.category === "TUNJANGAN_TETAP").reduce((a, c) => a + (c.amount ?? 0), 0);
  const ctx: PayContext = {
    values, fixedTotal, bpjsTk: input.bpjsBase ?? fixedTotal, bpjsKes: input.bpjsBase ?? fixedTotal,
    qty: { HARI_HADIR: input.daysPresent, HARI_MANGKIR: input.absentDays, HARI_KERJA: input.workDaysInMonth, MASA_KERJA: input.monthsOfService, HARI_DINAS: input.tripDays, KALI_DINAS: input.trips, HARI_CUTI: input.leaveDays },
    overtimeWork: input.overtimeWork, overtimeRest: input.overtimeRest, workDaysPerWeek: s.workDaysPerWeek, overtimeDivisor: s.overtimeDivisor, includeThr: true,
  };
  const lines: SimLine[] = [];
  for (const c of active) {
    if (c.method === "INPUT") {
      const v = values[c.code];
      if (v) lines.push({ code: c.code, name: c.name, kind: c.kind, amount: round(v), detail: "input" });
      continue;
    }
    const r = evaluate(c, ctx);
    if (!r || (r.amount === 0 && c.method !== "PERSEN")) continue;
    lines.push({ code: c.code, name: c.name, kind: c.kind, amount: round(r.amount), detail: r.detail });
  }
  const total = (k: string, excludeThr = false) => lines.filter((l) => l.kind === k && !(excludeThr && l.code === "THR")).reduce((a, l) => a + l.amount, 0);
  const earnings = total("PENDAPATAN", true), deductions = total("POTONGAN"), benefits = total("BENEFIT");
  return { lines, hourly: fixedTotal / s.overtimeDivisor, earnings, deductions, benefits, takeHome: earnings - deductions, employerCost: earnings + benefits };
}

// "4, 9; 5.5" → [4, 9, 5.5] (pemisah koma/spasi/titik koma, desimal pakai titik)
export const parseHours = (text: string) => text.split(/[\s,;+/]+/).map((x) => Number(x)).filter((x) => x > 0);
