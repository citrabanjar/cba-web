// Laporan (Panel Admin → TIME → Laporan): rincian per jenis untuk rentang tanggal dan karyawan terpilih.
// - Kehadiran / Semua: ringkasan per karyawan dari lib/attendance-recap.ts.
// - Cuti: setiap pengajuan cuti yang beririsan dengan rentang (semua status).
// - Lembur: setiap lembur (SPL / pengajuan) dalam rentang, dengan jam dibayar dan cek fisik.
import { prisma } from "@/lib/prisma";
import { getShiftCalendars } from "@/lib/schedule";
import { isRestDay, otPlan, paidHours, shiftWindow } from "@/lib/overtime";

const keyOf = (d: Date) => d.toISOString().slice(0, 10);
const hm = (d: Date | null) => (d ? new Date(d.getTime() + 7 * 3600_000).toISOString().slice(11, 16) : null);
const LEGACY: Record<string, string> = { TAHUNAN: "Cuti Tahunan", SAKIT: "Sakit", MELAHIRKAN: "Melahirkan", PENTING: "Keperluan Penting", LAINNYA: "Lainnya" };

export type LeaveReportRow = {
  id: string; userId: string; name: string; employeeId: string | null; department: string | null;
  policy: string; start: string; end: string; days: number; halfDay: string | null; status: string; reason: string;
  delegate: string | null; decidedBy: string | null; createdAt: string;
};
export async function buildLeaveReport(userIds: string[], from: Date, to: Date): Promise<LeaveReportRow[]> {
  if (!userIds.length) return [];
  const rows = await prisma.leaveRequest.findMany({
    where: { userId: { in: userIds }, startDate: { lte: to }, endDate: { gte: from } },
    include: { user: { select: { name: true, employeeId: true, department: { select: { name: true } } } }, policy: { select: { name: true } } },
    orderBy: [{ startDate: "asc" }, { createdAt: "asc" }],
  });
  return rows.map((r) => ({
    id: r.id, userId: r.userId, name: r.user.name, employeeId: r.user.employeeId, department: r.user.department?.name ?? null,
    policy: r.policy?.name ?? LEGACY[r.type] ?? r.type, start: keyOf(r.startDate), end: keyOf(r.endDate), days: r.totalDays, halfDay: r.halfDay,
    status: r.status, reason: r.reason, delegate: r.delegateName, decidedBy: r.approvedBy, createdAt: r.createdAt.toISOString(),
  }));
}

export type OvertimeReportRow = {
  id: string; userId: string; name: string; employeeId: string | null; department: string | null;
  date: string; start: string; end: string; source: string; reason: string | null; status: string; rest: boolean;
  planned: number; checkOut: string | null; paid: number | null; check: string | null; verify: string | null;
};
export async function buildOvertimeReport(userIds: string[], from: Date, to: Date): Promise<OvertimeReportRow[]> {
  if (!userIds.length) return [];
  const [rows, cal, atts] = await Promise.all([
    prisma.overtime.findMany({
      where: { userId: { in: userIds }, date: { gte: from, lte: to } },
      include: { user: { select: { name: true, employeeId: true, department: { select: { name: true } } } }, order: { select: { number: true } }, checks: { orderBy: { createdAt: "asc" } } },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    }),
    getShiftCalendars(userIds, from, to),
    prisma.attendance.findMany({ where: { userId: { in: userIds }, date: { gte: from, lte: to } }, select: { userId: true, date: true, checkIn: true, checkOut: true } }),
  ]);
  const attBy = new Map(atts.map((a) => [`${a.userId}|${keyOf(a.date)}`, a]));
  return rows.map((r) => {
    const k = keyOf(r.date), s = cal[r.userId]?.[k], a = attBy.get(`${r.userId}|${k}`);
    const rest = isRestDay(s, r.date);
    const ok = ["DISETUJUI", "APPROVED"].includes(r.status);
    const last = r.checks.at(-1);
    return {
      id: r.id, userId: r.userId, name: r.user.name, employeeId: r.user.employeeId, department: r.user.department?.name ?? null,
      date: k, start: r.startTime, end: r.endTime, source: r.order?.number ?? "Pengajuan", reason: r.reason, status: r.status, rest,
      planned: otPlan(r.startTime, r.endTime, rest).hours, checkOut: hm(a?.checkOut ?? null),
      paid: ok && a?.checkOut ? paidHours(r, a, shiftWindow(r.date, s), rest) : null,
      check: r.checkerIds.length ? (last ? `${last.present ? "Ada" : "Tidak ada"} ${hm(last.createdAt)} (${last.checkerName})` : "Belum dicek") : null,
      verify: r.verifyStatus === "MENUNGGU" ? "Menunggu konfirmasi atasan" : r.verifyStatus === "BENAR" ? "Benar lembur" : r.verifyStatus === "TIDAK" ? "Tidak lembur" : null,
    };
  });
}
