// Laporan (Panel Admin → TIME → Laporan): rincian per jenis untuk rentang tanggal dan karyawan terpilih.
// - Kehadiran / Semua: ringkasan per karyawan dari lib/attendance-recap.ts.
// - Cuti: setiap pengajuan cuti yang beririsan dengan rentang (semua status).
// - Lembur: setiap lembur (SPL / pengajuan) dalam rentang, dengan jam dibayar dan cek fisik.
// - Dinas, Tukar Shift, Lupa Absen, Reimbursement, Pinjaman: setiap pengajuan dalam rentang.
// Saringan status: "menunggu" = semua pekerjaan yang belum selesai (tanpa melihat rentang tanggal), supaya Laporan
// menjadi papan kerja Admin; "disetujui" / "ditolak" mengikuti rentang tanggal.
import { prisma } from "@/lib/prisma";
import { readApproval } from "@/lib/onboarding-interview";
import { getShiftCalendars } from "@/lib/schedule";
import { isRestDay, otPlan, paidHours, shiftWindow } from "@/lib/overtime";

const keyOf = (d: Date) => d.toISOString().slice(0, 10);
const hm = (d: Date | null) => (d ? new Date(d.getTime() + 7 * 3600_000).toISOString().slice(11, 16) : null);
export type ReportStatus = "" | "menunggu" | "disetujui" | "ditolak";
// Status per modul untuk tiap saringan.
const LEAVE_ST: Record<Exclude<ReportStatus, "">, string[]> = { menunggu: ["PENDING"], disetujui: ["APPROVED"], ditolak: ["REJECTED", "CANCELLED"] };
const OT_ST: Record<Exclude<ReportStatus, "">, string[]> = {
  menunggu: ["PENDING", "MENUNGGU_KARYAWAN"], disetujui: ["DISETUJUI", "APPROVED"], ditolak: ["REJECTED", "TIDAK_BERSEDIA", "CANCELLED", "DIBATALKAN"],
};
const SWAP_ST: Record<Exclude<ReportStatus, "">, string[]> = { menunggu: ["MENUNGGU_REKAN", "MENUNGGU_ATASAN"], disetujui: ["DISETUJUI"], ditolak: ["DITOLAK", "DIBATALKAN"] };
const LOAN_ST: Record<Exclude<ReportStatus, "">, string[]> = { menunggu: ["PENDING"], disetujui: ["DISETUJUI", "BERJALAN", "LUNAS"], ditolak: ["DITOLAK", "BATAL"] };
// Rentang tanggal tidak dipakai untuk "menunggu": semua yang belum selesai tampil.
const inRange = (status: ReportStatus) => status !== "menunggu";
const userSel = { select: { name: true, employeeId: true, department: { select: { name: true } }, manager: { select: { name: true } } } };
// Penyetuju yang sedang mendapat giliran: level Workflow atau atasan langsung.
const turnOf = (approval: unknown, manager: { name: string } | null) =>
  readApproval(approval)?.steps.find((x) => !x.decision)?.name ?? (manager ? `Atasan langsung · ${manager.name}` : "—");

const LEGACY: Record<string, string> = { TAHUNAN: "Cuti Tahunan", SAKIT: "Sakit", MELAHIRKAN: "Melahirkan", PENTING: "Keperluan Penting", LAINNYA: "Lainnya" };

export type LeaveReportRow = {
  id: string; userId: string; name: string; employeeId: string | null; department: string | null;
  policy: string; start: string; end: string; days: number; halfDay: string | null; status: string; reason: string;
  delegate: string | null; decidedBy: string | null; createdAt: string; turn: string | null;
};
export async function buildLeaveReport(userIds: string[], from: Date, to: Date, status: ReportStatus = ""): Promise<LeaveReportRow[]> {
  if (!userIds.length) return [];
  const rows = await prisma.leaveRequest.findMany({
    where: { userId: { in: userIds }, ...(inRange(status) ? { startDate: { lte: to }, endDate: { gte: from } } : {}), ...(status ? { status: { in: LEAVE_ST[status] as never[] } } : {}) },
    include: { user: userSel, policy: { select: { name: true } } },
    orderBy: [{ startDate: "asc" }, { createdAt: "asc" }],
  });
  return rows.map((r) => ({
    id: r.id, userId: r.userId, name: r.user.name, employeeId: r.user.employeeId, department: r.user.department?.name ?? null,
    policy: r.policy?.name ?? LEGACY[r.type] ?? r.type, start: keyOf(r.startDate), end: keyOf(r.endDate), days: r.totalDays, halfDay: r.halfDay,
    status: r.status, reason: r.reason, delegate: r.delegateName, decidedBy: r.approvedBy, createdAt: r.createdAt.toISOString(),
    turn: r.status === "PENDING" ? turnOf(r.approval, r.user.manager) : null,
  }));
}

export type OvertimeReportRow = {
  id: string; userId: string; name: string; employeeId: string | null; department: string | null;
  date: string; start: string; end: string; source: string; reason: string | null; status: string; rest: boolean;
  planned: number; checkOut: string | null; paid: number | null; check: string | null; verify: string | null;
};
export async function buildOvertimeReport(userIds: string[], from: Date, to: Date, status: ReportStatus = ""): Promise<OvertimeReportRow[]> {
  if (!userIds.length) return [];
  const [rows, cal, atts] = await Promise.all([
    prisma.overtime.findMany({
      where: { userId: { in: userIds }, ...(inRange(status) ? { date: { gte: from, lte: to } } : {}), ...(status ? { status: { in: OT_ST[status] } } : {}) },
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

// Dinas luar: setiap pengajuan yang tanggalnya beririsan dengan rentang.
export type TripReportRow = {
  id: string; userId: string; name: string; employeeId: string | null; department: string | null;
  destination: string; purpose: string; start: string; end: string; days: number; status: string; decidedBy: string | null; turn: string | null; createdAt: string;
};
export async function buildTripReport(userIds: string[], from: Date, to: Date, status: ReportStatus = ""): Promise<TripReportRow[]> {
  if (!userIds.length) return [];
  const rows = await prisma.businessTrip.findMany({
    where: { userId: { in: userIds }, ...(inRange(status) ? { startDate: { lte: to }, endDate: { gte: from } } : {}), ...(status ? { status: { in: LEAVE_ST[status] as never[] } } : {}) },
    include: { user: userSel }, orderBy: [{ startDate: "asc" }, { createdAt: "asc" }],
  });
  return rows.map((r) => ({
    id: r.id, userId: r.userId, name: r.user.name, employeeId: r.user.employeeId, department: r.user.department?.name ?? null,
    destination: r.destination, purpose: r.purpose, start: keyOf(r.startDate), end: keyOf(r.endDate), days: r.totalDays, status: r.status,
    decidedBy: r.approvedBy, turn: r.status === "PENDING" ? turnOf(r.approval, r.user.manager) : null, createdAt: r.createdAt.toISOString(),
  }));
}

// Tukar shift: pemohon atau rekan termasuk karyawan terpilih, tanggal tukar di dalam rentang.
export type SwapReportRow = {
  id: string; userId: string; name: string; employeeId: string | null; department: string | null;
  partner: string; date: string; requesterShift: string; partnerShift: string; reason: string | null; status: string; turn: string | null; decidedBy: string | null; createdAt: string;
};
export async function buildSwapReport(userIds: string[], from: Date, to: Date, status: ReportStatus = ""): Promise<SwapReportRow[]> {
  if (!userIds.length) return [];
  const rows = await prisma.shiftSwapRequest.findMany({
    where: {
      OR: [{ requesterId: { in: userIds } }, { partnerId: { in: userIds } }],
      ...(inRange(status) ? { date: { gte: from, lte: to } } : {}), ...(status ? { status: { in: SWAP_ST[status] } } : {}),
    },
    include: { requester: userSel, partner: { select: { name: true, employeeId: true } } }, orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  });
  const bossIds = [...new Set(rows.flatMap((r) => [r.managerAAt ? null : r.managerAId, r.managerBAt ? null : r.managerBId]).filter((x): x is string => !!x))];
  const boss = new Map((bossIds.length ? await prisma.user.findMany({ where: { id: { in: bossIds } }, select: { id: true, name: true } }) : []).map((u) => [u.id, u.name]));
  return rows.map((r) => {
    const waiting = [r.managerAAt ? null : r.managerAId, r.managerBAt ? null : r.managerBId].filter((x): x is string => !!x).map((id) => boss.get(id) ?? "—");
    return {
      id: r.id, userId: r.requesterId, name: r.requester.name, employeeId: r.requester.employeeId, department: r.requester.department?.name ?? null,
      partner: `${r.partner.name}${r.partner.employeeId ? ` (${r.partner.employeeId})` : ""}`, date: keyOf(r.date),
      requesterShift: r.requesterShift, partnerShift: r.partnerShift, reason: r.reason, status: r.status, decidedBy: r.decidedBy, createdAt: r.createdAt.toISOString(),
      turn: r.status === "MENUNGGU_REKAN" ? `Rekan · ${r.partner.name}` : r.status === "MENUNGGU_ATASAN" ? `Atasan · ${[...new Set(waiting)].join(", ") || "—"}` : null,
    };
  });
}

// Pinjaman: pengajuan yang dibuat di dalam rentang (saldo awal tidak termasuk). tahap = ATASAN | ADMIN | PIMPINAN (berjalan)
// atau SELESAI (diputus di dalam rentang).
export const LOAN_STAGE: Record<string, string> = { ATASAN: "Atasan", ADMIN: "Pemeriksaan Admin", PIMPINAN: "Pimpinan" };
export type LoanReportRow = {
  id: string; userId: string; name: string; employeeId: string | null; department: string | null;
  principal: number; tenor: number; startPeriod: string; purpose: string | null; status: string; stage: string | null; decidedBy: string | null; createdAt: string;
};
export async function buildLoanReport(userIds: string[], from: Date, to: Date, status: ReportStatus = "", stage = ""): Promise<LoanReportRow[]> {
  if (!userIds.length) return [];
  const range = { gte: new Date(from.getTime() - 7 * 3600_000), lt: new Date(to.getTime() + 86_400_000 - 7 * 3600_000) };
  const rows = await prisma.employeeLoan.findMany({
    where: {
      userId: { in: userIds }, isOpening: false,
      // Rentang WIB: dibuat (atau diputus, untuk tahap Selesai) di antara tanggal awal dan akhir.
      ...(stage === "SELESAI" ? { status: { not: "PENDING" }, approvedAt: range }
        : stage ? { status: "PENDING", ...(stage === "ADMIN" ? { OR: [{ stage: "ADMIN" }, { stage: null }] } : { stage }) }
        : { ...(inRange(status) ? { createdAt: range } : {}), ...(status ? { status: { in: LOAN_ST[status] } } : {}) }),
    },
    include: { user: userSel }, orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => ({
    id: r.id, userId: r.userId, name: r.user.name, employeeId: r.user.employeeId, department: r.user.department?.name ?? null,
    principal: r.principal, tenor: r.tenor, startPeriod: r.startPeriod, purpose: r.purpose, status: r.status,
    stage: r.status === "PENDING" ? (r.stage || "ADMIN") : null, decidedBy: r.approvedBy, createdAt: r.createdAt.toISOString(),
  }));
}

// Lupa Absen: pengajuan jam check-in / check-out yang tanggal absennya di dalam rentang.
export type FixReportRow = {
  id: string; userId: string; name: string; employeeId: string | null; department: string | null;
  date: string; checkIn: string | null; checkOut: string | null; reason: string; status: string; decidedBy: string | null; turn: string | null; createdAt: string;
};
export async function buildFixReport(userIds: string[], from: Date, to: Date, status: ReportStatus = ""): Promise<FixReportRow[]> {
  if (!userIds.length) return [];
  const rows = await prisma.attendanceCorrection.findMany({
    where: { userId: { in: userIds }, ...(inRange(status) ? { date: { gte: from, lte: to } } : {}), ...(status ? { status: { in: LEAVE_ST[status] } } : {}) },
    include: { user: userSel }, orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  });
  return rows.map((r) => ({
    id: r.id, userId: r.userId, name: r.user.name, employeeId: r.user.employeeId, department: r.user.department?.name ?? null,
    date: keyOf(r.date), checkIn: hm(r.checkIn), checkOut: hm(r.checkOut), reason: r.reason, status: r.status,
    decidedBy: r.decidedBy, turn: r.status === "PENDING" ? turnOf(r.approval, r.user.manager) : null, createdAt: r.createdAt.toISOString(),
  }));
}

// Reimbursement pengobatan: pengajuan yang tanggal berobatnya di dalam rentang.
const CLAIM_ST: Record<Exclude<ReportStatus, "">, string[]> = { menunggu: ["PENDING"], disetujui: ["APPROVED", "PAID"], ditolak: ["REJECTED", "CANCELLED"] };
export type ClaimReportRow = {
  id: string; userId: string; name: string; employeeId: string | null; department: string | null;
  date: string; provider: string; amount: number; payout: number; status: string; decidedBy: string | null; turn: string | null; files: { id: string; name: string }[];
};
export async function buildClaimReport(userIds: string[], from: Date, to: Date, status: ReportStatus = ""): Promise<ClaimReportRow[]> {
  if (!userIds.length) return [];
  const rows = await prisma.medicalClaim.findMany({
    where: { userId: { in: userIds }, ...(inRange(status) ? { treatDate: { gte: from, lte: to } } : {}), ...(status ? { status: { in: CLAIM_ST[status] } } : {}) },
    include: { user: userSel, files: { select: { id: true, name: true } } }, orderBy: [{ treatDate: "asc" }, { createdAt: "asc" }],
  });
  return rows.map((r) => ({
    id: r.id, userId: r.userId, name: r.user.name, employeeId: r.user.employeeId, department: r.user.department?.name ?? null,
    date: keyOf(r.treatDate), provider: r.provider, amount: r.amount, payout: r.payout, status: r.status,
    decidedBy: r.decidedBy, turn: r.status === "PENDING" ? turnOf(r.approval, r.user.manager) : null, files: r.files,
  }));
}
