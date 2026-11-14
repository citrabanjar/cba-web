// Label, setelan bawaan, dan mesin rumus komponen payroll. Aman dipakai di server dan browser.
//
// Komponen = alat hitung yang menghasilkan satu baris output saat Proses Gaji. Nilainya:
// - INPUT: diisi admin di profil karyawan (tab Gaji), atau
// - RUMUS: cara hitung + parameter data (jam lembur, kegiatan dinas, hari hadir, masa kerja, nilai komponen lain).
// Perubahan per karyawan (promosi/demosi) diatur lewat tempelan komponen, bukan dengan mengubah komponen.

export const PAY_KINDS = [
  { key: "PENDAPATAN", label: "Pendapatan" },
  { key: "POTONGAN", label: "Potongan" },
  { key: "BENEFIT", label: "Benefit (ditanggung perusahaan)" },
] as const;

// Kategori mengikuti baris bukti potong PPh 21 (formulir 1721-A1). Kategori juga menentukan objek pajak.
export const PAY_CATEGORIES = [
  { key: "GAJI", label: "Gaji", hint: "1721-A1 baris 1. Potongan berkategori Gaji (mis. potongan mangkir) mengurangi bruto.", taxable: true },
  { key: "TUNJANGAN_PPH", label: "Tunjangan PPh", hint: "1721-A1 baris 2.", taxable: true },
  { key: "TUNJANGAN_LAIN", label: "Tunjangan lainnya, uang lembur, dsb.", hint: "1721-A1 baris 3: tunjangan jabatan, makan, transport, lembur, uang saku dinas.", taxable: true },
  { key: "HONORARIUM", label: "Honorarium dan imbalan sejenis", hint: "1721-A1 baris 4.", taxable: true },
  { key: "PREMI_ASURANSI", label: "Premi asuransi dibayar perusahaan", hint: "1721-A1 baris 5: JKK, JKM, BPJS Kesehatan bagian perusahaan.", taxable: true },
  { key: "NATURA", label: "Natura dan kenikmatan", hint: "1721-A1 baris 6.", taxable: true },
  { key: "BONUS_THR", label: "Tantiem, bonus, gratifikasi, THR", hint: "1721-A1 baris 7.", taxable: true },
  { key: "IURAN_PENSIUN", label: "Iuran pensiun / JHT dibayar karyawan", hint: "1721-A1 baris 10: pengurang penghasilan bruto (JHT & JP karyawan).", taxable: false },
  { key: "PPH21", label: "PPh 21", hint: "Pajak yang dipotong.", taxable: false },
  { key: "BUKAN_OBJEK", label: "Bukan objek pajak", hint: "Tidak masuk perhitungan PPh 21 (mis. JHT/JP bagian perusahaan, BPJS Kesehatan karyawan, kasbon).", taxable: false },
] as const;
export const isTaxableCategory = (k: string) => PAY_CATEGORIES.find((c) => c.key === k)?.taxable ?? false;

// Cara hitung. INPUT = nilai diisi; sisanya rumus. PPH21 adalah komponen sistem (tidak bisa dipilih).
export const PAY_METHODS = [
  { key: "INPUT", label: "Input nilai", hint: "Nilai diisi admin di profil karyawan (tab Gaji)." },
  { key: "NOMINAL", label: "Flat for all", hint: "Satu nominal per bulan, sama untuk semua karyawan yang ditempel." },
  { key: "PER_SATUAN", label: "Nominal x Parameter", hint: "Contoh: uang saku dinas Rp100.000 x kegiatan dinas. Bisa diberi syarat minimal, lalu centang \"Berlaku kelipatan\" bila dibayar per kelipatan (mis. uang makan lembur Rp15.000 tiap 4 jam, minimal 4 jam)." },
  { key: "PERSEN", label: "Persen dari dasar nilai", hint: "Contoh: BPJS 1% x upah, dengan batas atas/bawah." },
  { key: "PRORATA", label: "Dasar nilai / hari sebulan x parameter", hint: "Contoh: potongan mangkir = gaji pokok / jumlah hari bulan berjalan (28-31) x hari mangkir." },
  { key: "PER_JAM", label: "Dasar nilai / hari sebulan / jam x parameter", hint: "Contoh: potongan terlambat = gaji pokok / jumlah hari bulan berjalan (28-31) / 8 jam x jam terlambat." },
  { key: "LEMBUR", label: "Upah lembur", hint: "Dasar nilai / pembagi x tarif per jam. Tarif bawaan mengikuti PP 35/2021; baris tarif bisa diubah atau dihapus." },
  { key: "THR", label: "Kelipatan upah, tidak rutin (THR, Bonus)", hint: "Dasar nilai x jumlah bulan upah. Hanya dihitung bila dipilih saat Proses Gaji." },
] as const;
export const SYSTEM_METHODS = ["PPH21"];

// Parameter data yang bisa dipakai rumus.
export const PAY_PARAMS = [
  { key: "JAM_LEMBUR", label: "Jam lembur", unit: "jam" },
  { key: "HARI_DINAS", label: "Hari dinas luar", unit: "hari" },
  { key: "KALI_DINAS", label: "Kegiatan dinas luar (kali)", unit: "kali" },
  { key: "HARI_HADIR", label: "Hari hadir", unit: "hari" },
  { key: "HARI_MANGKIR", label: "Hari mangkir", unit: "hari" },
  { key: "JAM_TELAT_PULANG_CEPAT", label: "Jam terlambat + pulang cepat", unit: "jam" },
  { key: "JAM_TERLAMBAT", label: "Jam terlambat (lebih dari 30 menit)", unit: "jam" },
  { key: "JAM_PULANG_CEPAT", label: "Jam pulang cepat", unit: "jam" },
  { key: "KALI_TERLAMBAT", label: "Kali terlambat (lewat toleransi)", unit: "kali" },
  { key: "HARI_CUTI", label: "Hari cuti disetujui", unit: "hari" },
  { key: "HARI_CUTI_TANPA_UPAH", label: "Hari cuti di luar tanggungan", unit: "hari" },
  { key: "HARI_KERJA", label: "Hari kerja sebulan", unit: "hari" },
  { key: "MASA_KERJA", label: "Masa kerja", unit: "bulan" },
] as const;
export const NEEDS_PARAM = ["PER_SATUAN", "PRORATA", "PER_JAM"];
export const NEEDS_BASE = ["PERSEN", "PRORATA", "LEMBUR", "THR", "PER_JAM"];

export const PAY_BASES = [
  { key: "GAJI_POKOK", label: "Gaji pokok" },
  { key: "UPAH_TETAP", label: "Upah tetap (gaji pokok + komponen upah tetap)" },
  { key: "UPAH_BPJS_TK", label: "Upah BPJS Ketenagakerjaan" },
  { key: "UPAH_BPJS_KES", label: "Upah BPJS Kesehatan" },
  { key: "KOMPONEN", label: "Komponen yang dicentang" },
] as const;
// Upah BPJS per karyawan tidak dipakai lagi: dasar BPJS diatur di komponen (gaji pokok / komponen dicentang /
// upah tetap + batas atas & bawah). Pilihan lama hanya ditampilkan bila komponen masih memakainya.
export const LEGACY_BASES = ["UPAH_BPJS_TK", "UPAH_BPJS_KES"];

// Tarif lembur bertingkat: jam ke-1 s/d upTo memakai pengali x; baris terakhir upTo = null (jam berikutnya).
export type Tier = { upTo: number | null; x: number };
export type PayParams = {
  prorate?: boolean; // ikut prorata karyawan masuk/keluar/berhenti dapat di tengah periode
  fixedWage?: boolean; // termasuk upah tetap (dasar lembur, THR, BPJS)
  min?: number; // Nominal x Parameter: syarat minimal parameter (jam lembur dicek per lembur)
  step?: number; // Nominal x Parameter: berlaku kelipatan
  divisor?: number; work?: Tier[]; rest?: Tier[] | null; // upah lembur; rest null = tarif hari libur sama dengan hari kerja
  months?: number; minMonths?: number; proportional?: boolean; // THR / bonus
  hoursPerDay?: number; // dasar nilai / hari sebulan / jam: jam kerja per hari tetap (bila tidak ikut shift)
  shiftHours?: boolean; // jam kerja per hari ikut lama kerja shift hari itu (tanpa istirahat)
  reducesGross?: boolean; // potongan mengurangi penghasilan bruto PPh 21
  workday?: number[]; rest6?: number[]; rest5?: number[]; // format lama lembur
};
export const DEFAULT_WORK_TIERS: Tier[] = [{ upTo: 1, x: 1.5 }, { upTo: null, x: 2 }];
export const defaultRestTiers = (workDaysPerWeek: 5 | 6): Tier[] =>
  workDaysPerWeek === 6 ? [{ upTo: 7, x: 2 }, { upTo: 8, x: 3 }, { upTo: null, x: 4 }] : [{ upTo: 8, x: 2 }, { upTo: 9, x: 3 }, { upTo: null, x: 4 }];

// Tarif lembur komponen (membaca juga format lama workday/rest6/rest5).
export function overtimeTiers(p: PayParams | null | undefined, workDaysPerWeek: 5 | 6): { work: Tier[]; rest: Tier[] | null } {
  const q = p ?? {};
  if (q.work?.length) return { work: q.work, rest: q.rest?.length ? q.rest : null };
  const work = q.workday?.length === 2 ? [{ upTo: 1, x: q.workday[0] }, { upTo: null, x: q.workday[1] }] : DEFAULT_WORK_TIERS;
  const old = workDaysPerWeek === 6 ? q.rest6 : q.rest5;
  const a = workDaysPerWeek === 6 ? 7 : 8;
  const rest = old?.length === 3 ? [{ upTo: a, x: old[0] }, { upTo: a + 1, x: old[1] }, { upTo: null, x: old[2] }] : defaultRestTiers(workDaysPerWeek);
  return { work, rest };
}
export const tierHours = (hours: number, tiers: Tier[]) => {
  let total = 0, prev = 0;
  for (const t of tiers) {
    const cap = t.upTo ?? Infinity;
    if (hours > prev) total += (Math.min(hours, cap) - prev) * t.x;
    prev = cap;
  }
  return total;
};

// Ketentuan undang-undang untuk peringatan bila angkanya diubah.
const LEGAL_RATES: Record<string, { rate?: number; min?: number; max?: number; source: string }> = {
  JHTP: { rate: 3.7, source: "PP 46/2015" }, JHTK: { rate: 2, source: "PP 46/2015" },
  JKK: { min: 0.24, max: 1.74, source: "PP 44/2015" }, JKM: { rate: 0.3, source: "PP 44/2015" },
  JPP: { rate: 2, source: "PP 45/2015" }, JPK: { rate: 1, source: "PP 45/2015" },
  KESP: { rate: 4, source: "Perpres 64/2020" }, KESK: { rate: 1, source: "Perpres 64/2020" },
};
const sameTiers = (a: Tier[] | null, b: Tier[]) => !!a && a.length === b.length && a.every((t, i) => t.upTo === b[i].upTo && t.x === b[i].x);
export function legalWarning(c: { code: string; method: string; rate: number | null; params?: PayParams | null }, workDaysPerWeek: 5 | 6 = 6): string | null {
  const l = LEGAL_RATES[c.code];
  if (l && c.rate !== null && c.method === "PERSEN") {
    if (l.rate !== undefined && c.rate !== l.rate) return `Berbeda dari ketentuan ${l.source} (${String(l.rate).replace(".", ",")}%)`;
    if (l.min !== undefined && (c.rate < l.min || c.rate > (l.max ?? Infinity))) return `Di luar rentang ${l.source} (${l.min}–${l.max}%)`;
  }
  const p = c.params ?? {};
  if (c.method === "LEMBUR") {
    const t = overtimeTiers(p, workDaysPerWeek);
    if ((p.divisor ?? 173) !== 173 || !sameTiers(t.work, DEFAULT_WORK_TIERS) || !sameTiers(t.rest, defaultRestTiers(workDaysPerWeek))) {
      return "Berbeda dari ketentuan PP 35/2021 (1/173; 1,5x lalu 2x; hari libur 2x/3x/4x)";
    }
  }
  if (c.method === "THR" && c.code === "THR" && ((p.months ?? 1) < 1 || (p.minMonths ?? 1) > 1)) return "Di bawah ketentuan Permenaker 6/2016 (1 bulan upah, masa kerja minimal 1 bulan)";
  return null;
}

const find = <T extends { key: string; label: string }>(list: readonly T[], k: string | null | undefined) =>
  list.find((x) => x.key === k)?.label ?? k ?? "";
export const kindLabel = (k: string) => find(PAY_KINDS, k);
export const categoryLabel = (k: string) => find(PAY_CATEGORIES, k);
export const methodLabel = (k: string) => (k === "PPH21" ? "PPh 21 otomatis" : find(PAY_METHODS, k));
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
  periodStartDay: number; // tanggal mulai periode gaji (1 = sebulan kalender)
  payDay: number; // tanggal gajian (0 = hari kerja terakhir bulan itu)
  overtimeDivisor: number; // pembagi upah sejam lembur
  workDaysPerWeek: 5 | 6; // dipakai untuk tarif bawaan lembur hari istirahat
  prorate: "HARI_KERJA" | "HARI_KALENDER"; // gaji karyawan masuk/keluar di tengah periode
  rounding: number; // pembulatan rupiah (1, 100, 1000)
  weekStartDay: number; // payroll mingguan: hari mulai minggu (0 = Minggu, 1 = Senin, ... 6 = Sabtu)
  // Identitas pemotong untuk bukti potong 1721-A1.
  companyName: string; companyNpwp: string; signerName: string; signerId: string; // signerId = NPWP/NIK penandatangan
};

export const PAYROLL_SETTING_KEY = "payroll.settings";
export const DEFAULT_PAYROLL_SETTINGS: PayrollSettings = {
  periodStartDay: 1, payDay: 0, overtimeDivisor: 173, workDaysPerWeek: 6, prorate: "HARI_KERJA", rounding: 1, weekStartDay: 1,
  companyName: "PT. Citra Banjar Abadi", companyNpwp: "", signerName: "", signerId: "",
};

export const rupiah = (n: number) => `Rp${Math.round(n).toLocaleString("id-ID")}`;
const num = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");

// Data satu karyawan dalam satu periode yang dipakai rumus.
export type PayContext = {
  values: Record<string, number>; // nilai komponen input/flat per kode (GP = gaji pokok)
  fixedTotal: number; // upah tetap
  bpjsTk: number; bpjsKes: number;
  qty: Record<string, number>; // jumlah per parameter (HARI_HADIR, KALI_DINAS, MASA_KERJA, ...)
  overtimeWork: number[]; overtimeRest: number[]; // jam lembur per pengajuan (hari kerja / hari libur)
  workDaysPerWeek: 5 | 6; overtimeDivisor: number;
  nonRoutine: string[]; // kode komponen tidak rutin (THR, bonus) yang disertakan periode ini
  prorataDays?: number; // pembagi "dasar nilai / hari sebulan" khusus karyawan harian (pengali gaji harian → bulanan)
  periodDays?: number; // jumlah hari kalender periode (bulan berjalan: 28-31)
};

type EvalComponent = Pick<PayComponentInput, "code" | "name" | "kind" | "category" | "method" | "param" | "amount" | "rate" | "base" | "capAmount" | "floorAmount" | "params" | "baseCodes">;

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

export function baseValue(c: EvalComponent, ctx: PayContext) {
  if (c.base === "GAJI_POKOK") return ctx.values.GP ?? 0;
  if (c.base === "UPAH_BPJS_KES") return ctx.bpjsKes;
  if (c.base === "UPAH_BPJS_TK" || c.base === "UPAH_BPJS") return ctx.bpjsTk;
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
    case "NOMINAL": return { amount: c.amount ?? 0, detail: "flat per bulan" };
    case "PER_SATUAN": {
      // 1) jumlah parameter (jam lembur per lembur), 2) syarat minimal, 3) bila berlaku kelipatan: dihitung per kelipatan.
      const step = p.step ?? 0, min = p.min ?? 0;
      const occ = (c.param === "JAM_LEMBUR" ? [...ctx.overtimeWork, ...ctx.overtimeRest] : [paramTotal(c.param, ctx)]).filter((q) => q >= min);
      const times = step > 0 ? occ.reduce((x, q) => x + Math.floor(q / step + 1e-9), 0) : sum(occ);
      const cond = [min ? `min ${num(min)} ${paramUnit(c.param)}` : "", step ? `kelipatan ${num(step)} ${paramUnit(c.param)}` : ""].filter(Boolean).join(", ");
      return { amount: (c.amount ?? 0) * times, detail: `${rupiah(c.amount ?? 0)} x ${num(times)}${step ? "" : ` ${paramUnit(c.param)}`}${cond ? ` (${cond})` : ""}` };
    }
    case "PERSEN": {
      let b = baseValue(c, ctx);
      if (c.floorAmount) b = Math.max(b, c.floorAmount);
      if (c.capAmount) b = Math.min(b, c.capAmount);
      return { amount: (b * (c.rate ?? 0)) / 100, detail: `${num(c.rate ?? 0)}% x ${rupiah(b)}` };
    }
    case "PRORATA": {
      // Pembagi = jumlah hari bulan berjalan (28-31); karyawan harian: pengali gaji harian → bulanan.
      const days = ctx.prorataDays || ctx.periodDays || 30, q = paramTotal(c.param, ctx), b = baseValue(c, ctx);
      return { amount: days ? (b / days) * q : 0, detail: `${rupiah(b)} / ${days} hari x ${num(q)} ${paramUnit(c.param)}` };
    }
    case "PER_JAM": {
      const days = ctx.periodDays || 30, q = paramTotal(c.param, ctx), b = baseValue(c, ctx);
      // Ikut shift: tarif per jam tiap hari = dasar / hari sebulan / jam kerja shift hari itu.
      const frac = ctx.qty[`FR_${c.param}`];
      if (p.shiftHours && frac !== undefined) {
        return { amount: (b / days) * frac, detail: `${rupiah(b)} / ${days} hari / jam kerja shift x ${num(q)} ${paramUnit(c.param)}` };
      }
      const hours = p.hoursPerDay || 8;
      return { amount: (b / days / hours) * q, detail: `${rupiah(b)} / ${days} hari / ${num(hours)} jam x ${num(q)} ${paramUnit(c.param)}` };
    }
    case "LEMBUR": {
      const hourly = baseValue(c, ctx) / (p.divisor ?? ctx.overtimeDivisor);
      const t = overtimeTiers(p, ctx.workDaysPerWeek);
      const w = sum(ctx.overtimeWork), r = sum(ctx.overtimeRest);
      // Tarif dihitung per pengajuan supaya jam pertama tiap lembur tetap memakai tarif baris pertama.
      const amount = hourly * (ctx.overtimeWork.reduce((x, h) => x + tierHours(h, t.work), 0) + ctx.overtimeRest.reduce((x, h) => x + tierHours(h, t.rest ?? t.work), 0));
      return { amount, detail: `upah sejam ${rupiah(hourly)} · ${num(w)} jam hari kerja, ${num(r)} jam hari libur` };
    }
    case "THR": {
      if (!ctx.nonRoutine.includes(c.code)) return null;
      const m = ctx.qty.MASA_KERJA ?? 0, k = p.months ?? 1, min = p.minMonths ?? 1, b = baseValue(c, ctx);
      if (m < min) return { amount: 0, detail: `masa kerja ${m} bulan, minimal ${min}` };
      const prop = p.proportional !== false && m < 12;
      return { amount: prop ? (b * k * m) / 12 : b * k, detail: prop ? `${m}/12 x ${num(k)} x ${rupiah(b)}` : `${num(k)} x ${rupiah(b)}` };
    }
    default: return null;
  }
}

// Kalimat ringkas rumus untuk kartu komponen.
export function describe(c: EvalComponent & { params?: PayParams | null }, workDaysPerWeek: 5 | 6 = 6) {
  const p = c.params ?? {};
  const b = c.base === "KOMPONEN" ? (c.baseCodes.length ? c.baseCodes.join(" + ") : "komponen belum dipilih") : baseLabel(c.base ?? "UPAH_TETAP");
  const tiers = (t: Tier[]) => t.map((x, i) => `${x.upTo === null ? (i ? "berikutnya" : "semua jam") : `s/d jam ${num(x.upTo)}`} ${num(x.x)}x`).join(", ");
  switch (c.method) {
    case "INPUT": return c.code === "GP" ? "Gaji pokok di profil karyawan" : "Input di profil karyawan";
    case "NOMINAL": return `${rupiah(c.amount ?? 0)} per bulan (flat)`;
    case "PER_SATUAN": {
      const u = paramUnit(c.param);
      return `${rupiah(c.amount ?? 0)} x ${paramLabel(c.param)}${p.min ? `, syarat minimal ${num(p.min)} ${u}${c.param === "JAM_LEMBUR" ? " per lembur" : ""}` : ""}${p.step ? `, berlaku kelipatan ${num(p.step)} ${u}` : ""}`;
    }
    case "PERSEN": {
      const extra = [c.floorAmount ? `min ${rupiah(c.floorAmount)}` : "", c.capAmount ? `maks ${rupiah(c.capAmount)}` : ""].filter(Boolean).join(", ");
      return `${num(c.rate ?? 0)}% x ${b}${extra ? ` (${extra})` : ""}`;
    }
    case "PRORATA": return `${b} / hari sebulan x ${paramLabel(c.param)}`;
    case "PER_JAM": return `${b} / hari bulan berjalan / ${p.shiftHours ? "jam kerja shift hari itu" : `${num(p.hoursPerDay || 8)} jam`} x ${paramLabel(c.param)}`;
    case "LEMBUR": {
      const t = overtimeTiers(p, workDaysPerWeek);
      return `1/${p.divisor ?? 173} x ${b} · ${t.rest ? "hari kerja " : ""}${tiers(t.work)}${t.rest ? ` · hari libur ${tiers(t.rest)}` : ""}`;
    }
    case "THR": return `${num(p.months ?? 1)} x ${b} · masa kerja min ${p.minMonths ?? 1} bulan${p.proportional !== false ? ", proporsional < 12 bulan" : ""} · tidak rutin`;
    case "PPH21": return "PPh 21 otomatis (TER bulanan, setahun di masa pajak terakhir)";
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
  const active = components.filter((c) => c.isActive);
  const values: Record<string, number> = { GP: input.basic };
  const fixedInput = active.find((c) => c.method === "INPUT" && c.code !== "GP" && c.params?.fixedWage);
  if (fixedInput) values[fixedInput.code] = input.fixedAllowance;
  for (const c of active) if (c.method === "NOMINAL") values[c.code] = c.amount ?? 0;
  const fixedTotal = input.basic + input.fixedAllowance
    + active.filter((c) => c.method === "NOMINAL" && c.params?.fixedWage).reduce((a, c) => a + (c.amount ?? 0), 0);
  const ctx: PayContext = {
    values, fixedTotal, bpjsTk: input.bpjsBase ?? fixedTotal, bpjsKes: input.bpjsBase ?? fixedTotal,
    qty: { HARI_HADIR: input.daysPresent, HARI_MANGKIR: input.absentDays, HARI_KERJA: input.workDaysInMonth, MASA_KERJA: input.monthsOfService, HARI_DINAS: input.tripDays, KALI_DINAS: input.trips, HARI_CUTI: input.leaveDays },
    overtimeWork: input.overtimeWork, overtimeRest: input.overtimeRest, workDaysPerWeek: s.workDaysPerWeek, overtimeDivisor: s.overtimeDivisor,
    nonRoutine: active.filter((c) => c.method === "THR").map((c) => c.code),
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
  const nonRoutine = new Set(ctx.nonRoutine);
  const total = (k: string, routineOnly = false) => lines.filter((l) => l.kind === k && !(routineOnly && nonRoutine.has(l.code))).reduce((a, l) => a + l.amount, 0);
  const earnings = total("PENDAPATAN", true), deductions = total("POTONGAN"), benefits = total("BENEFIT");
  return { lines, nonRoutine, hourly: fixedTotal / s.overtimeDivisor, earnings, deductions, benefits, takeHome: earnings - deductions, employerCost: earnings + benefits };
}

// "4, 9; 5.5" → [4, 9, 5.5] (pemisah koma/spasi/titik koma, desimal pakai titik)
export const parseHours = (text: string) => text.split(/[\s,;+/]+/).map((x) => Number(x)).filter((x) => x > 0);
