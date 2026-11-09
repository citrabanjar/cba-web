// PPh Pasal 21 pegawai tetap: tarif efektif rata-rata (TER) bulanan untuk Januari-November,
// dan hitung ulang setahun di masa pajak terakhir (Desember / bulan keluar) dengan tarif Pasal 17.
// Dasar: PP 58/2023 (Lampiran tarif efektif), PMK 168/2023, PTKP PMK 101/2016, UU HPP (tarif Pasal 17).

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

// PTKP setahun (PMK 101/2016). K/I/n (penghasilan istri digabung) dipakai seperti K/n untuk pemotongan bulanan.
const PTKP: Record<string, number> = {
  "TK/0": 54_000_000, "TK/1": 58_500_000, "TK/2": 63_000_000, "TK/3": 67_500_000,
  "K/0": 58_500_000, "K/1": 63_000_000, "K/2": 67_500_000, "K/3": 72_000_000,
};
const normalize = (status: string | null | undefined) => {
  const s = (status ?? "TK/0").toUpperCase().replace(/\s/g, "").replace("K/I/", "K/");
  return PTKP[s] !== undefined ? s : "TK/0";
};

export function terCategory(status: string | null | undefined): "A" | "B" | "C" {
  const s = normalize(status);
  if (["TK/0", "TK/1", "K/0"].includes(s)) return "A";
  if (["TK/2", "TK/3", "K/1", "K/2"].includes(s)) return "B";
  return "C";
}
export const ptkpOf = (status: string | null | undefined) => PTKP[normalize(status)];

export function terRate(gross: number, status: string | null | undefined) {
  const table = { A: TER_A, B: TER_B, C: TER_C }[terCategory(status)];
  return (table.find(([upTo]) => gross <= upTo) ?? table[table.length - 1])[1];
}

// PPh 21 bulanan Januari-November: penghasilan bruto sebulan x tarif TER.
export function pph21Monthly(gross: number, status: string | null | undefined) {
  const rate = terRate(gross, status);
  return { rate, tax: Math.floor((gross * rate) / 100) };
}

// Tarif progresif Pasal 17 (UU HPP) atas PKP setahun.
export function pasal17(pkp: number) {
  const layers: [number, number][] = [[60_000_000, 5], [250_000_000, 15], [500_000_000, 25], [5_000_000_000, 30], [Infinity, 35]];
  let tax = 0, prev = 0;
  for (const [cap, rate] of layers) {
    if (pkp <= prev) break;
    tax += ((Math.min(pkp, cap) - prev) * rate) / 100;
    prev = cap;
  }
  return Math.floor(tax);
}

// Masa pajak terakhir: PPh 21 setahun dikurangi PPh 21 yang sudah dipotong (TER) bulan-bulan sebelumnya.
// grossYear = bruto setahun; pensionDeductYear = iuran JHT + JP yang dibayar karyawan setahun.
export function pph21Final(opts: { grossYear: number; pensionDeductYear: number; months: number; status: string | null | undefined; withheld: number }) {
  const jobCost = Math.min(opts.grossYear * 0.05, 500_000 * opts.months); // biaya jabatan 5%, maks Rp500.000 sebulan
  const net = opts.grossYear - jobCost - opts.pensionDeductYear;
  const pkp = Math.max(0, Math.floor((net - ptkpOf(opts.status)) / 1000) * 1000); // dibulatkan ke bawah ribuan
  const yearTax = pasal17(pkp);
  return { jobCost, net, ptkp: ptkpOf(opts.status), pkp, yearTax, tax: Math.max(0, yearTax - opts.withheld), refund: Math.max(0, opts.withheld - yearTax) };
}
