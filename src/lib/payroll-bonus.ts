// Jadwal pembayaran THR / Bonus (komponen cara hitung THR), diatur di Payroll & Benefit -> Pengaturan.
// - BULANAN: ikut proses gaji bulanan yang periodenya memuat tanggal bayar (karyawan payroll mingguan: ikut minggu tanggal bayar).
// - MINGGUAN: ikut gajian mingguan (Senin) yang terdekat pada / sebelum tanggal bayar (karyawan bulanan ikut dengan komponen itu saja).
// - TERPISAH: proses gaji tersendiri pada tanggal bayar.
// PPh 21 THR karyawan bulanan selalu dihitung di proses gaji bulanan pada bulan THR dibayar.
import { prisma } from "@/lib/prisma";

export const BONUS_SETTING_KEY = "payroll.bonus-schedule";
export const BONUS_MODES = [
  { key: "BULANAN", label: "Ikut payroll bulanan" },
  { key: "MINGGUAN", label: "Ikut payroll mingguan" },
  { key: "TERPISAH", label: "Dibayar terpisah" },
] as const;
export type BonusMode = (typeof BONUS_MODES)[number]["key"];
export type BonusEntry = { id: string; code: string; label: string; payDate: string; mode: BonusMode };

export async function getBonusSchedule(): Promise<BonusEntry[]> {
  const row = await prisma.appSetting.findUnique({ where: { key: BONUS_SETTING_KEY } });
  const list = (row?.value as { entries?: BonusEntry[] } | null)?.entries;
  return Array.isArray(list) ? list.filter((e) => e && /^\d{4}-\d{2}-\d{2}$/.test(e.payDate) && e.code) : [];
}

// Jadwal yang tanggal bayarnya di rentang [from, to] (YYYY-MM-DD), opsional per cara bayar.
export const bonusIn = (all: BonusEntry[], from: string, to: string, modes?: BonusMode[]) =>
  all.filter((e) => e.payDate >= from && e.payDate <= to && (!modes || modes.includes(e.mode)));
