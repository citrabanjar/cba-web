// Karyawan yang belum absen masuk hari ini (indikator Beranda "Belum Absen Hari Ini" dan Laporan → Kehadiran).
// Masuk hitungan bila: karyawan aktif; hari ini hari kerja menurut shift-nya (bukan OFF / libur / jadwal manual kosong);
// jam masuk shift + toleransi terlambat sudah lewat; belum check-in; tidak sedang cuti / izin / dinas luar yang disetujui.
// Karyawan Bebas Absen tetap dihitung (keputusan pemilik 2026-11-20), ditandai exempt.
import { prisma } from "@/lib/prisma";
import { getShiftCalendars } from "@/lib/schedule";

export type NotCheckedInRow = {
  userId: string; name: string; employeeId: string | null; department: string | null;
  shift: string; start: string; exempt: boolean;
};

const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };

export async function notCheckedInToday(): Promise<NotCheckedInRow[]> {
  const wib = new Date(Date.now() + 7 * 3600_000);
  const todayKey = wib.toISOString().slice(0, 10);
  const today = new Date(`${todayKey}T00:00:00Z`);
  const nowMin = wib.getUTCHours() * 60 + wib.getUTCMinutes();

  const users = await prisma.user.findMany({
    where: { isActive: true, role: { not: "SUPER_ADMIN" } },
    orderBy: [{ employeeNo: "asc" }, { name: "asc" }],
    select: { id: true, name: true, employeeId: true, attendanceExempt: true, department: { select: { name: true } } },
  });
  if (!users.length) return [];
  const ids = users.map((u) => u.id);
  const [cal, checked, leaves, trips] = await Promise.all([
    getShiftCalendars(ids, today, today),
    prisma.attendance.findMany({ where: { userId: { in: ids }, date: today, checkIn: { not: null } }, select: { userId: true } }),
    prisma.leaveRequest.findMany({ where: { userId: { in: ids }, status: "APPROVED", startDate: { lte: today }, endDate: { gte: today } }, select: { userId: true } }),
    prisma.businessTrip.findMany({ where: { userId: { in: ids }, status: "APPROVED", startDate: { lte: today }, endDate: { gte: today } }, select: { userId: true } }),
  ]);
  const skip = new Set([...checked, ...leaves, ...trips].map((x) => x.userId));
  return users.flatMap((u) => {
    if (skip.has(u.id)) return [];
    const d = cal[u.id]?.[todayKey];
    if (!d || d.isOff || d.holiday || d.manual || !d.startTime) return [];
    if (toMin(d.startTime) + (d.lateTolerance ?? 0) > nowMin) return []; // jam masuk belum lewat
    return [{ userId: u.id, name: u.name, employeeId: u.employeeId, department: u.department?.name ?? null, shift: d.name, start: d.startTime, exempt: u.attendanceExempt }];
  });
}
