// Label, setelan bawaan, dan rumus simulasi payroll. Aman dipakai di server dan browser.

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

// "Dasar perhitungan" yang bisa dipilih saat membuat komponen. Angka koefisiennya diisi super admin.
export const PAY_METHODS = [
  { key: "TETAP", label: "Nominal per karyawan (diisi di profil / per periode)" },
  { key: "NOMINAL_BULANAN", label: "Nominal sama untuk semua karyawan per bulan" },
  { key: "PER_HADIR", label: "Nominal x hari hadir" },
  { key: "PER_LEMBUR", label: "Nominal x kelipatan jam lembur" },
  { key: "PERSEN", label: "Persen dari dasar upah" },
  { key: "RUMUS_LEMBUR", label: "Rumus lembur (1/173)" },
  { key: "RUMUS_THR", label: "Rumus THR" },
  { key: "PPH21_TER", label: "PPh 21 (TER)" },
  { key: "PRORATA_MANGKIR", label: "Prorata hari mangkir" },
] as const;

export const PAY_BASES = [
  { key: "GAJI_POKOK", label: "Gaji pokok" },
  { key: "UPAH_TETAP", label: "Gaji pokok + tunjangan tetap" },
  { key: "UPAH_BPJS", label: "Upah BPJS" },
  { key: "KOMPONEN", label: "Komponen yang dicentang" },
] as const;

// Metode yang memakai dasar upah (bisa memilih komponen dasarnya).
export const USES_BASE = ["PERSEN", "RUMUS_LEMBUR", "RUMUS_THR", "PRORATA_MANGKIR"];

export type OvertimeParams = { divisor: number; workday: [number, number]; rest6: [number, number, number]; rest5: [number, number, number] };
export type PayParams = { divisor?: number; workday?: number[]; rest6?: number[]; rest5?: number[]; months?: number };
export const DEFAULT_OVERTIME: OvertimeParams = { divisor: 173, workday: [1.5, 2], rest6: [2, 3, 4], rest5: [2, 3, 4] };

type CoefFields = { method: string; amount: number | null; rate: number | null; params?: PayParams | null };
// Koefisien wajib per dasar perhitungan; komponen yang belum lengkap tidak ikut dihitung.
export function missingCoefficient(c: CoefFields): string | null {
  const p = c.params ?? {};
  switch (c.method) {
    case "NOMINAL_BULANAN": case "PER_HADIR": return c.amount ? null : "nominal";
    case "PER_LEMBUR": return c.amount && c.rate ? null : "nominal dan kelipatan jam";
    case "PERSEN": return c.rate ? null : "persen";
    case "RUMUS_LEMBUR": return p.divisor && p.workday?.length === 2 && p.rest6?.length === 3 && p.rest5?.length === 3 ? null : "pembagi dan pengali lembur";
    case "RUMUS_THR": return p.months ? null : "jumlah bulan upah";
    default: return null;
  }
}

// Ketentuan undang-undang untuk peringatan bila koefisien diubah super admin.
const LEGAL_RATES: Record<string, { rate?: number; min?: number; max?: number; source: string }> = {
  JHTP: { rate: 3.7, source: "PP 46/2015" }, JHTK: { rate: 2, source: "PP 46/2015" },
  JKK: { min: 0.24, max: 1.74, source: "PP 44/2015" }, JKM: { rate: 0.3, source: "PP 44/2015" },
  JPP: { rate: 2, source: "PP 45/2015" }, JPK: { rate: 1, source: "PP 45/2015" },
  KESP: { rate: 4, source: "Perpres 64/2020" }, KESK: { rate: 1, source: "Perpres 64/2020" },
};
export function legalWarning(c: { code: string; method: string; rate: number | null; params?: PayParams | null }): string | null {
  const l = LEGAL_RATES[c.code];
  if (l && c.rate !== null) {
    if (l.rate !== undefined && c.rate !== l.rate) return `Berbeda dari ketentuan ${l.source} (${String(l.rate).replace(".", ",")}%)`;
    if (l.min !== undefined && (c.rate < l.min || c.rate > (l.max ?? Infinity))) return `Di luar rentang ${l.source} (${l.min}–${l.max}%)`;
  }
  const p = c.params ?? {};
  if (c.method === "RUMUS_LEMBUR") {
    const same = (a: number[] | undefined, b: number[]) => !!a && a.length === b.length && a.every((x, i) => x === b[i]);
    if (p.divisor !== 173 || !same(p.workday, DEFAULT_OVERTIME.workday) || !same(p.rest6, DEFAULT_OVERTIME.rest6) || !same(p.rest5, DEFAULT_OVERTIME.rest5)) {
      return "Berbeda dari ketentuan PP 35/2021 (1/173; 1,5x lalu 2x; libur 2x/3x/4x)";
    }
  }
  if (c.method === "RUMUS_THR" && p.months !== undefined && p.months < 1) return "Di bawah ketentuan Permenaker 6/2016 (1 bulan upah)";
  return null;
}

const find = <T extends { key: string; label: string }>(list: readonly T[], k: string | null | undefined) =>
  list.find((x) => x.key === k)?.label ?? k ?? "";
export const kindLabel = (k: string) => find(PAY_KINDS, k);
export const categoryLabel = (k: string) => find(PAY_CATEGORIES, k);
export const methodLabel = (k: string) => find(PAY_METHODS, k);
export const baseLabel = (k: string | null) => find(PAY_BASES, k);
export const isOneOf = (list: readonly { key: string }[], k: string | null | undefined) => list.some((x) => x.key === k);

export type PayComponentInput = {
  code: string; name: string; kind: string; category: string; method: string;
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

type SimComponent = Pick<PayComponentInput, "code" | "name" | "kind" | "category" | "method" | "amount" | "rate" | "base" | "capAmount" | "floorAmount" | "isActive" | "params" | "baseCodes">;
export type SimInput = {
  basic: number; fixedAllowance: number; bpjsBase: number | null;
  daysPresent: number; overtimeHours: number; restDayOvertimeHours: number; monthsOfService: number; absentDays: number; workDaysInMonth: number;
  overtimeMeals?: number; // kali uang makan lembur; kosong = dihitung dari jam lembur (anggap satu pengajuan per jenis hari)
};

// Kali uang makan lembur satu pengajuan: per kelipatan `every` jam (4 jam = 1x, 8 jam = 2x).
export const overtimeMealCount = (hours: number, every = 4) => (every > 0 ? Math.floor(hours / every + 1e-9) : 0);
export type SimLine = { code: string; name: string; kind: string; amount: number; detail: string };

// Upah lembur (PP 35/2021) dengan pengali dari koefisien komponen.
export function overtimePay(hourly: number, workdayHours: number, restHours: number, workDaysPerWeek: 5 | 6, params?: PayParams | null) {
  const p = { ...DEFAULT_OVERTIME, ...(params ?? {}) } as OvertimeParams;
  const [w1, w2] = p.workday;
  const w = Math.min(1, workdayHours) * w1 + Math.max(0, workdayHours - 1) * w2;
  const [r1, r2, r3] = workDaysPerWeek === 6 ? p.rest6 : p.rest5;
  const a = workDaysPerWeek === 6 ? 7 : 8; // jam pengali pertama sampai jam ke-a, jam berikutnya pengali kedua, sisanya ketiga
  const r = Math.min(restHours, a) * r1 + Math.min(Math.max(restHours - a, 0), 1) * r2 + Math.max(restHours - a - 1, 0) * r3;
  return hourly * (w + r);
}

// Simulasi gaji satu karyawan untuk satu bulan (tanpa PPh 21).
export function simulate(components: SimComponent[], s: PayrollSettings, input: SimInput) {
  const fixed = input.basic + input.fixedAllowance;
  const bpjsBase = input.bpjsBase ?? fixed;
  const round = (n: number) => Math.round(n / s.rounding) * s.rounding;
  const lines: SimLine[] = [];
  // Dasar "komponen yang dicentang": GP = gaji pokok, komponen lain = tunjangan tetap simulasi.
  const baseOf = (c: SimComponent) =>
    c.base === "GAJI_POKOK" ? input.basic : c.base === "UPAH_BPJS" ? bpjsBase
    : c.base === "KOMPONEN" ? (c.baseCodes.includes("GP") ? input.basic : 0) + (c.baseCodes.some((x) => x !== "GP") ? input.fixedAllowance : 0)
    : fixed;

  let fixedUsed = false;
  for (const c of components.filter((x) => x.isActive && !missingCoefficient(x))) {
    let amount = 0;
    let detail = "";
    if (c.category === "GAJI_POKOK") { amount = input.basic; detail = "Gaji pokok"; }
    else if (c.category === "TUNJANGAN_TETAP" && c.method === "TETAP") {
      if (fixedUsed) continue; // simulasi memakai satu angka tunjangan tetap
      fixedUsed = true; amount = input.fixedAllowance; detail = "Tunjangan tetap";
    }
    else if (c.method === "NOMINAL_BULANAN") { amount = c.amount ?? 0; detail = "nominal semua karyawan"; }
    else if (c.method === "PER_HADIR") { amount = (c.amount ?? 0) * input.daysPresent; detail = `${rupiah(c.amount ?? 0)} x ${input.daysPresent} hari`; }
    else if (c.method === "PER_LEMBUR") {
      const times = input.overtimeMeals ?? overtimeMealCount(input.overtimeHours, c.rate ?? 4) + overtimeMealCount(input.restDayOvertimeHours, c.rate ?? 4);
      amount = (c.amount ?? 0) * times; detail = `${rupiah(c.amount ?? 0)} x ${times} kali (per kelipatan ${c.rate ?? 4} jam lembur)`;
    }
    else if (c.method === "PERSEN") {
      let base = baseOf(c);
      if (c.floorAmount) base = Math.max(base, c.floorAmount);
      if (c.capAmount) base = Math.min(base, c.capAmount);
      amount = (base * (c.rate ?? 0)) / 100;
      detail = `${c.rate ?? 0}% x ${rupiah(base)}`;
    } else if (c.method === "RUMUS_LEMBUR") {
      const hourly = baseOf(c) / (c.params?.divisor ?? s.overtimeDivisor);
      amount = overtimePay(hourly, input.overtimeHours, input.restDayOvertimeHours, s.workDaysPerWeek, c.params);
      detail = `Upah sejam ${rupiah(hourly)} · ${input.overtimeHours} jam hari kerja, ${input.restDayOvertimeHours} jam hari libur`;
    } else if (c.method === "RUMUS_THR") {
      const m = input.monthsOfService, k = c.params?.months ?? 1, base = baseOf(c);
      amount = m >= 12 ? base * k : m >= 1 ? (base * k * m) / 12 : 0;
      detail = m >= 12 ? `${k} bulan upah` : `${m}/12 x ${k} bulan upah`;
    } else if (c.method === "PRORATA_MANGKIR") {
      amount = input.workDaysInMonth > 0 ? (baseOf(c) / input.workDaysInMonth) * input.absentDays : 0;
      detail = `${input.absentDays} hari mangkir`;
    } else continue; // nominal per periode (bonus, kasbon) dan PPh 21 tidak disimulasikan
    if (amount === 0 && c.method !== "PERSEN") continue;
    lines.push({ code: c.code, name: c.name, kind: c.kind, amount: round(amount), detail });
  }
  const sum = (k: string, excludeThr = false) =>
    lines.filter((l) => l.kind === k && !(excludeThr && l.code === "THR")).reduce((a, l) => a + l.amount, 0);
  const earnings = sum("PENDAPATAN", true);
  const deductions = sum("POTONGAN");
  const benefits = sum("BENEFIT");
  const hourly = fixed / s.overtimeDivisor;
  return { lines, hourly, earnings, deductions, benefits, takeHome: earnings - deductions, employerCost: earnings + benefits };
}
