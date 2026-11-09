// PPh Pasal 21 pegawai tetap: tarif efektif rata-rata (TER) bulanan untuk Januari-November,
// dan hitung ulang setahun di masa pajak terakhir (Desember / bulan keluar) dengan tarif Pasal 17.
// Dasar: PP 58/2023 (Lampiran tarif efektif), PMK 168/2023. PTKP & tarif Pasal 17 diatur per tahun di Pengaturan.

type Bracket = [upTo: number, rate: number]; // penghasilan bruto sebulan s/d upTo → rate %

const TER_A: Bracket[] = [
  [5_400_000, 0], [5_650_000, 0.25], [5_950_000, 0.5], [6_300_000, 0.75], [6_750_000, 1], [7_500_000, 1.25],
  [8_550_000, 1.5], [9_650_000, 1.75], [10_050_000, 2], [10_350_000, 2.25], [10_700_000, 2.5], [11_050_000, 3],
  [11_600_000, 3.5], [12_500_000, 4], [13_750_000, 5], [15_100_000, 6], [16_950_000, 7], [19_750_000, 8],
  [24_150_000, 9], [26_450_000, 10], [28_000_000, 11], [30_050_000, 12], [32_400_000, 13], [35_400_000, 14],
  [39_100_000, 15], [43_850_000, 16], [47_800_000, 17], [51_400_000, 18], [56_300_000, 19], [62_200_000, 20],
  [68_600_000, 21], [77_500_000, 22], [89_000_000, 23], [103_000_000, 24], [125_000_000, 25], [157_000_000, 26],
  [206_000_000, 27], [337_000_000, 28], [454_000_000, 29], [550_000_000, 30], [695_000_000, 31], [910_000_000, 32],
  [1_400_000_000, 33], [Infinity, 34],
];
const TER_B: Bracket[] = [
  [6_200_000, 0], [6_500_000, 0.25], [6_850_000, 0.5], [7_300_000, 0.75], [9_200_000, 1], [10_750_000, 1.5],
  [11_250_000, 2], [11_600_000, 2.5], [12_600_000, 3], [13_600_000, 4], [14_950_000, 5], [16_400_000, 6],
  [18_450_000, 7], [21_850_000, 8], [26_000_000, 9], [27_700_000, 10], [29_350_000, 11], [31_450_000, 12],
  [33_950_000, 13], [37_100_000, 14], [41_100_000, 15], [45_800_000, 16], [49_500_000, 17], [53_800_000, 18],
  [58_500_000, 19], [64_000_000, 20], [71_000_000, 21], [80_000_000, 22], [93_000_000, 23], [109_000_000, 24],
  [129_000_000, 25], [163_000_000, 26], [211_000_000, 27], [374_000_000, 28], [459_000_000, 29], [555_000_000, 30],
  [704_000_000, 31], [957_000_000, 32], [1_405_000_000, 33], [Infinity, 34],
];
const TER_C: Bracket[] = [
  [6_600_000, 0], [6_950_000, 0.25], [7_350_000, 0.5], [7_800_000, 0.75], [8_850_000, 1], [9_800_000, 1.25],
  [10_950_000, 1.5], [11_200_000, 1.75], [12_050_000, 2], [12_950_000, 3], [14_150_000, 4], [15_550_000, 5],
  [17_050_000, 6], [19_500_000, 7], [22_700_000, 8], [26_600_000, 9], [28_100_000, 10], [30_100_000, 11],
  [32_600_000, 12], [35_400_000, 13], [38_900_000, 14], [43_000_000, 15], [47_400_000, 16], [51_200_000, 17],
  [55_800_000, 18], [60_400_000, 19], [66_700_000, 20], [74_500_000, 21], [83_200_000, 22], [95_600_000, 23],
  [110_000_000, 24], [134_000_000, 25], [169_000_000, 26], [221_000_000, 27], [390_000_000, 28], [463_000_000, 29],
  [561_000_000, 30], [709_000_000, 31], [965_000_000, 32], [1_419_000_000, 33], [Infinity, 34],
];

// Pengaturan PPh 21 per tahun pajak (PTKP, tarif Pasal 17, biaya jabatan) — bisa diubah di Pengaturan Payroll.
export type TaxYearConfig = {
  ptkpSelf: number; // wajib pajak sendiri
  ptkpMarried: number; // tambahan kawin
  ptkpDependent: number; // tambahan per tanggungan
  maxDependents: number;
  brackets: { upTo: number | null; rate: number }[]; // lapisan PKP setahun; upTo null = lapisan terakhir
  jobCostRate: number; // biaya jabatan (%)
  jobCostMaxMonthly: number; // batas biaya jabatan per bulan
};
export const TAX_SETTING_KEY = "pph21.settings";
// Bawaan: PTKP PMK 101/2016, tarif Pasal 17 UU HPP, biaya jabatan 5% maks Rp500.000 sebulan.
export const DEFAULT_TAX_YEAR: TaxYearConfig = {
  ptkpSelf: 54_000_000, ptkpMarried: 4_500_000, ptkpDependent: 4_500_000, maxDependents: 3,
  brackets: [
    { upTo: 60_000_000, rate: 5 }, { upTo: 250_000_000, rate: 15 }, { upTo: 500_000_000, rate: 25 },
    { upTo: 5_000_000_000, rate: 30 }, { upTo: null, rate: 35 },
  ],
  jobCostRate: 5, jobCostMaxMonthly: 500_000,
};
// Pengaturan yang berlaku untuk satu tahun: tahun itu, atau tahun terdekat sebelumnya.
export function taxYearConfig(all: Record<string, TaxYearConfig> | null | undefined, year: number): TaxYearConfig {
  const years = Object.keys(all ?? {}).map(Number).filter((y) => y <= year).sort((a, b) => b - a);
  return years.length ? { ...DEFAULT_TAX_YEAR, ...all![String(years[0])] } : DEFAULT_TAX_YEAR;
}

// Status PTKP: TK/n atau K/n (K/I/n dipakai seperti K/n untuk pemotongan bulanan).
const parseStatus = (status: string | null | undefined) => {
  const m = /^(TK|K)\/(?:I\/)?([0-3])$/.exec((status ?? "TK/0").toUpperCase().replace(/\s/g, ""));
  return m ? { married: m[1] === "K", dependents: Number(m[2]) } : { married: false, dependents: 0 };
};

export function terCategory(status: string | null | undefined): "A" | "B" | "C" {
  const { married, dependents } = parseStatus(status);
  const s = `${married ? "K" : "TK"}/${dependents}`;
  if (["TK/0", "TK/1", "K/0"].includes(s)) return "A";
  if (["TK/2", "TK/3", "K/1", "K/2"].includes(s)) return "B";
  return "C";
}
export function ptkpOf(status: string | null | undefined, cfg: TaxYearConfig = DEFAULT_TAX_YEAR) {
  const { married, dependents } = parseStatus(status);
  return cfg.ptkpSelf + (married ? cfg.ptkpMarried : 0) + Math.min(dependents, cfg.maxDependents) * cfg.ptkpDependent;
}

// Tarif TER yang bisa diatur dengan tanggal berlaku. Bawaan: Lampiran PP 58/2023 (berlaku 1 Januari 2024).
export type TerRow = { upTo: number | null; rate: number }; // penghasilan s/d upTo → rate %; upTo null = baris terakhir
export type TerVersion = { effectiveDate: string; A: TerRow[]; B: TerRow[]; C: TerRow[]; daily: TerRow[] };
export const TER_SETTING_KEY = "pph21.ter";
const toRows = (t: Bracket[]): TerRow[] => t.map(([upTo, rate]) => ({ upTo: Number.isFinite(upTo) ? upTo : null, rate }));
export const DEFAULT_TER: TerVersion = {
  effectiveDate: "2024-01-01", A: toRows(TER_A), B: toRows(TER_B), C: toRows(TER_C),
  // TER harian pegawai tidak tetap: s/d Rp450.000 sehari 0%, di atasnya 0,5% (s/d Rp2.500.000 sehari).
  daily: [{ upTo: 450_000, rate: 0 }, { upTo: null, rate: 0.5 }],
};
// Versi TER yang berlaku pada tanggal tertentu (YYYY-MM-DD).
export function terVersionAt(list: TerVersion[] | null | undefined, date: string): TerVersion {
  const ok = (list ?? []).filter((v) => v.effectiveDate <= date).sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));
  return ok[0] ?? DEFAULT_TER;
}
const pick = (rows: TerRow[], amount: number) => (rows.find((r) => r.upTo === null || amount <= r.upTo) ?? rows[rows.length - 1])?.rate ?? 0;

export function terRate(gross: number, status: string | null | undefined, ter: TerVersion = DEFAULT_TER) {
  return pick(ter[terCategory(status)], gross);
}

// PPh 21 bulanan Januari-November: penghasilan bruto sebulan x tarif TER (PP 58/2023).
export function pph21Monthly(gross: number, status: string | null | undefined, ter: TerVersion = DEFAULT_TER) {
  const rate = terRate(gross, status, ter);
  return { rate, tax: Math.floor((gross * rate) / 100) };
}

// PPh 21 karyawan harian/mingguan: tarif TER harian dari rata-rata penghasilan sehari.
export function pph21Daily(gross: number, days: number, ter: TerVersion = DEFAULT_TER) {
  const perDay = days > 0 ? gross / days : gross;
  const rate = pick(ter.daily, perDay);
  return { rate, perDay, tax: Math.floor((gross * rate) / 100) };
}

// Tarif progresif Pasal 17 atas PKP setahun.
export function pasal17(pkp: number, cfg: TaxYearConfig = DEFAULT_TAX_YEAR) {
  let tax = 0, prev = 0;
  for (const b of cfg.brackets) {
    const cap = b.upTo ?? Infinity;
    if (pkp <= prev) break;
    tax += ((Math.min(pkp, cap) - prev) * b.rate) / 100;
    prev = cap;
  }
  return Math.floor(tax);
}

// Masa pajak terakhir: PPh 21 setahun dikurangi PPh 21 yang sudah dipotong (TER) bulan-bulan sebelumnya.
// grossYear = bruto setahun; pensionDeductYear = iuran JHT + JP yang dibayar karyawan setahun.
export function pph21Final(opts: {
  grossYear: number; pensionDeductYear: number; months: number; status: string | null | undefined; withheld: number; cfg?: TaxYearConfig;
}) {
  const cfg = opts.cfg ?? DEFAULT_TAX_YEAR;
  const jobCost = Math.min((opts.grossYear * cfg.jobCostRate) / 100, cfg.jobCostMaxMonthly * opts.months);
  const net = opts.grossYear - jobCost - opts.pensionDeductYear;
  const ptkp = ptkpOf(opts.status, cfg);
  const pkp = Math.max(0, Math.floor((net - ptkp) / 1000) * 1000); // dibulatkan ke bawah ribuan
  const yearTax = pasal17(pkp, cfg);
  return { jobCost, net, ptkp, pkp, yearTax, tax: Math.max(0, yearTax - opts.withheld), refund: Math.max(0, opts.withheld - yearTax) };
}
