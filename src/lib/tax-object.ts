// Kode Objek Pajak otomatis dari Status Pajak + Jadwal Gajian (keputusan pemilik 2026-11-19):
// - Pegawai Tetap (termasuk karyawan kontrak berstatus pajak tetap) → 21-100-01.
// - Pegawai Tidak Tetap, payroll bulanan → 21-100-35.
// - Payroll mingguan (pegawai tidak tetap) → 21-100-24, atau 21-100-30 bila gaji harian di atas Rp 2.500.000.
// - Status Pajak belum diisi: mingguan seperti di atas; bulanan memakai pilihan Admin (kosong → 21-100-01).
// Cara hitung PPh 21 mengikuti kode ini (lib/payroll-run).
import { prisma } from "@/lib/prisma";

export const DAILY_LIMIT = 2_500_000;

export function autoTaxObjectCode(schedule: string | null | undefined, dailyWage: number | null | undefined, current: string | null | undefined, taxStatus?: string | null) {
  if (schedule === "Mingguan") return (dailyWage ?? 0) > DAILY_LIMIT ? "21-100-30" : "21-100-24";
  if (taxStatus === "Pegawai Tetap") return "21-100-01";
  if (taxStatus === "Pegawai Tidak Tetap") return "21-100-35";
  return current === "21-100-01" || current === "21-100-35" ? current : "21-100-01";
}

// Samakan kode objek pajak karyawan dengan status pajak, jadwal gajian, dan gaji harian terakhir yang berlaku.
export async function syncTaxObjectCode(userIds: string[]) {
  if (!userIds.length) return;
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: {
      id: true, paymentSchedule: true, taxObjectCode: true, taxStatus: true,
      salaries: { where: { effectiveDate: { lte: today } }, orderBy: { effectiveDate: "desc" }, take: 1, select: { dailyWage: true } },
    },
  });
  for (const u of users) {
    const code = autoTaxObjectCode(u.paymentSchedule, u.salaries[0]?.dailyWage, u.taxObjectCode, u.taxStatus);
    if (code !== u.taxObjectCode) await prisma.user.update({ where: { id: u.id }, data: { taxObjectCode: code } });
  }
}
