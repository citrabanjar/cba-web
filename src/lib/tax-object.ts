// Kode Objek Pajak otomatis (keputusan pemilik 2026-11-19):
// - Payroll mingguan: 21-100-24 (gaji harian s/d Rp 2.500.000), 21-100-30 (gaji harian di atas Rp 2.500.000).
// - Payroll bulanan: pilihan Admin (21-100-01 atau 21-100-35); kosong atau masih kode mingguan → 21-100-01.
import { prisma } from "@/lib/prisma";

export const DAILY_LIMIT = 2_500_000;

export function autoTaxObjectCode(schedule: string | null | undefined, dailyWage: number | null | undefined, current: string | null | undefined) {
  if (schedule === "Mingguan") return (dailyWage ?? 0) > DAILY_LIMIT ? "21-100-30" : "21-100-24";
  return current === "21-100-01" || current === "21-100-35" ? current : "21-100-01";
}

// Samakan kode objek pajak karyawan dengan jadwal gajian dan gaji harian terakhir yang berlaku.
export async function syncTaxObjectCode(userIds: string[]) {
  if (!userIds.length) return;
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: {
      id: true, paymentSchedule: true, taxObjectCode: true,
      salaries: { where: { effectiveDate: { lte: today } }, orderBy: { effectiveDate: "desc" }, take: 1, select: { dailyWage: true } },
    },
  });
  for (const u of users) {
    const code = autoTaxObjectCode(u.paymentSchedule, u.salaries[0]?.dailyWage, u.taxObjectCode);
    if (code !== u.taxObjectCode) await prisma.user.update({ where: { id: u.id }, data: { taxObjectCode: code } });
  }
}
