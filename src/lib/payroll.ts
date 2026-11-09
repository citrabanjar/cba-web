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

export const PAY_METHODS = [
  { key: "TETAP", label: "Nominal tetap per karyawan" },
  { key: "PER_HADIR", label: "Nominal x hari hadir" },
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
] as const;

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

type SimComponent = Pick<PayComponentInput, "code" | "name" | "kind" | "category" | "method" | "amount" | "rate" | "base" | "capAmount" | "floorAmount" | "isActive">;
export type SimInput = {
  basic: number; fixedAllowance: number; bpjsBase: number | null;
  daysPresent: number; overtimeHours: number; restDayOvertimeHours: number; monthsOfService: number; absentDays: number; workDaysInMonth: number;
};
export type SimLine = { code: string; name: string; kind: string; amount: number; detail: string };

// Upah lembur menurut PP 35/2021.
export function overtimePay(hourly: number, workdayHours: number, restHours: number, workDaysPerWeek: 5 | 6) {
  const w = Math.min(1, workdayHours) * 1.5 + Math.max(0, workdayHours - 1) * 2;
  const [a, b] = workDaysPerWeek === 6 ? [7, 8] : [8, 9]; // jam 2x sampai a, jam ke-b 3x, sisanya 4x
  const r = Math.min(restHours, a) * 2 + Math.min(Math.max(restHours - a, 0), 1) * 3 + Math.max(restHours - (b), 0) * 4;
  return hourly * (w + r);
}

// Simulasi gaji satu karyawan untuk satu bulan (tanpa PPh 21).
export function simulate(components: SimComponent[], s: PayrollSettings, input: SimInput) {
  const fixed = input.basic + input.fixedAllowance;
  const bpjsBase = input.bpjsBase ?? fixed;
  const hourly = fixed / s.overtimeDivisor;
  const round = (n: number) => Math.round(n / s.rounding) * s.rounding;
  const lines: SimLine[] = [];
  const baseOf = (b: string | null) => (b === "GAJI_POKOK" ? input.basic : b === "UPAH_BPJS" ? bpjsBase : fixed);

  let fixedUsed = false;
  for (const c of components.filter((x) => x.isActive)) {
    let amount = 0;
    let detail = "";
    if (c.category === "GAJI_POKOK") { amount = input.basic; detail = "Gaji pokok"; }
    else if (c.category === "TUNJANGAN_TETAP" && c.method === "TETAP") {
      if (fixedUsed) continue; // simulasi memakai satu angka tunjangan tetap
      fixedUsed = true; amount = input.fixedAllowance; detail = "Tunjangan tetap";
    }
    else if (c.method === "PER_HADIR") { amount = (c.amount ?? 0) * input.daysPresent; detail = `${rupiah(c.amount ?? 0)} x ${input.daysPresent} hari`; }
    else if (c.method === "PERSEN") {
      let base = baseOf(c.base);
      if (c.floorAmount) base = Math.max(base, c.floorAmount);
      if (c.capAmount) base = Math.min(base, c.capAmount);
      amount = (base * (c.rate ?? 0)) / 100;
      detail = `${c.rate ?? 0}% x ${rupiah(base)}`;
    } else if (c.method === "RUMUS_LEMBUR") {
      amount = overtimePay(hourly, input.overtimeHours, input.restDayOvertimeHours, s.workDaysPerWeek);
      detail = `Upah sejam ${rupiah(hourly)} · ${input.overtimeHours} jam hari kerja, ${input.restDayOvertimeHours} jam hari libur`;
    } else if (c.method === "RUMUS_THR") {
      const m = input.monthsOfService;
      amount = m >= 12 ? fixed : m >= 1 ? (fixed * m) / 12 : 0;
      detail = m >= 12 ? "1 bulan upah" : `${m}/12 x upah sebulan`;
    } else if (c.method === "PRORATA_MANGKIR") {
      amount = input.workDaysInMonth > 0 ? (fixed / input.workDaysInMonth) * input.absentDays : 0;
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
  return { lines, hourly, earnings, deductions, benefits, takeHome: earnings - deductions, employerCost: earnings + benefits };
}
