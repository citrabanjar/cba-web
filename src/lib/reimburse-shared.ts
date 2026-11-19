// Parameter Reimbursement Pengobatan (aman dipakai di browser dan server). Nilai diatur Admin Payroll di
// Payroll & Benefit → Pengaturan → Reimbursement Pengobatan.
export const REIMBURSE_KEY = "reimburse.medical";

export type ReimburseSettings = {
  enabled: boolean;
  percent: number; // persentase penggantian dari nominal kuitansi (0-100)
  yearlyCap: number; // plafon per tahun (Rp); 0 = tanpa plafon
  reset: "JANUARI" | "ULANG_TAHUN"; // plafon diperbarui tiap 1 Januari atau tiap ulang tahun masa kerja
  prorata: boolean; // karyawan baru di tahun berjalan: plafon prorata sisa bulan
  forStatus: "SEMUA" | "TETAP" | "KONTRAK"; // status kerja yang berhak
  minServiceMonths: number; // masa kerja minimal (bulan); 0 = langsung berhak
  deadlineDays: number; // diajukan paling lambat sekian hari setelah tanggal berobat; 0 = tanpa batas
  needDoctorLetter: boolean; // surat dokter wajib dilampirkan (kuitansi selalu wajib)
  taxable: boolean; // ikut penghasilan bruto PPh 21
};

export const DEFAULT_REIMBURSE: ReimburseSettings = {
  enabled: false, percent: 100, yearlyCap: 0, reset: "JANUARI", prorata: false, forStatus: "SEMUA",
  minServiceMonths: 0, deadlineDays: 30, needDoctorLetter: true, taxable: true,
};

export const RESET_OPTIONS = [
  { key: "JANUARI", label: "Setiap 1 Januari" },
  { key: "ULANG_TAHUN", label: "Setiap ulang tahun masa kerja" },
] as const;
export const STATUS_OPTIONS = [
  { key: "SEMUA", label: "Semua karyawan" },
  { key: "TETAP", label: "Karyawan tetap" },
  { key: "KONTRAK", label: "Karyawan kontrak" },
] as const;

export const FILE_KINDS = [
  { key: "KUITANSI", label: "Kuitansi / nota klinik" },
  { key: "SURAT_DOKTER", label: "Surat dokter" },
  { key: "RESEP", label: "Resep (jika ada)" },
] as const;
export type FileKind = (typeof FILE_KINDS)[number]["key"];

export const CLAIM_STATUS: Record<string, { label: string; tone: string }> = {
  PENDING: { label: "Menunggu persetujuan", tone: "bg-amber-100 text-amber-700" },
  APPROVED: { label: "Disetujui, menunggu gajian", tone: "bg-sky-100 text-sky-700" },
  PAID: { label: "Dibayar", tone: "bg-green-100 text-green-700" },
  REJECTED: { label: "Ditolak", tone: "bg-red-100 text-red-700" },
  CANCELLED: { label: "Dibatalkan", tone: "bg-gray-100 text-gray-500" },
};

export function readReimburse(raw: unknown): ReimburseSettings {
  const v = (raw ?? {}) as Partial<ReimburseSettings>;
  const n = (x: unknown, max: number, d: number) => (Number.isFinite(Number(x)) ? Math.max(0, Math.min(max, Number(x))) : d);
  return {
    enabled: v.enabled === true,
    percent: n(v.percent, 100, DEFAULT_REIMBURSE.percent),
    yearlyCap: n(v.yearlyCap, 1e11, 0),
    reset: v.reset === "ULANG_TAHUN" ? "ULANG_TAHUN" : "JANUARI",
    prorata: v.prorata === true,
    forStatus: v.forStatus === "TETAP" || v.forStatus === "KONTRAK" ? v.forStatus : "SEMUA",
    minServiceMonths: Math.round(n(v.minServiceMonths, 600, 0)),
    deadlineDays: Math.round(n(v.deadlineDays, 3650, DEFAULT_REIMBURSE.deadlineDays)),
    needDoctorLetter: v.needDoctorLetter !== false,
    taxable: v.taxable !== false,
  };
}
