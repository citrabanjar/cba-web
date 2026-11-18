import { prisma } from "@/lib/prisma";
import { canEditMenu } from "@/lib/roles";
import { pendingSwapApprovals } from "@/lib/shift-swap";
import { isInterviewApprover, pendingInterviewApprovals } from "@/lib/onboarding-settings";
import { isWorkflowApprover } from "@/lib/workflow-settings";
import { actionableApprovers, readApproval } from "@/lib/onboarding-interview";
import { Prisma } from "@prisma/client";
import { loanReviewTurn, loanTurn, readLoanFlow } from "@/lib/loans";

// Pengajuan cuti/dinas tanpa jejak workflow = jalur atasan langsung.
export const noWorkflow = { approval: { equals: Prisma.DbNull } };
const withWorkflow = { approval: { not: Prisma.DbNull } };

// Cuti/dinas lewat menu Workflow yang menunggu keputusan user ini (giliran levelnya).
async function pendingWorkflowRequests(userId: string) {
  const [leaves, trips, ots, fixes] = await Promise.all([
    prisma.leaveRequest.findMany({ where: { status: "PENDING", ...withWorkflow }, select: { approval: true } }),
    prisma.businessTrip.findMany({ where: { status: "PENDING", ...withWorkflow }, select: { approval: true } }),
    prisma.overtime.findMany({ where: { status: "PENDING", ...withWorkflow }, select: { approval: true } }),
    prisma.attendanceCorrection.findMany({ where: { status: "PENDING", ...withWorkflow }, select: { approval: true } }),
  ]);
  return [...leaves, ...trips, ...ots, ...fixes].filter((r) => actionableApprovers(readApproval(r.approval)).includes(userId)).length;
}

// Jalur persetujuan cuti & dinas luar (keputusan pemilik 2026-11-10): penyetuju = ATASAN LANGSUNG
// yang aktif. Karyawan tanpa atasan aktif tidak bisa mengirim pengajuan (ditolak saat dikirim), dan
// Task Admin mengingatkan HRD untuk mengisi atasannya. Tidak ada jalur cadangan ke HRD.
// Nanti diatur lewat menu Workflow (lihat ceklist), dan workflow yang menang.

export type Approver = { id: string; role: string; menuAccess?: string[] };

// Perubahan data pribadi (Profil Saya) diputus Admin yang punya akses menu Data Karyawan.
export const reviewsProfiles = (a: Approver) => canEditMenu({ role: a.role, menuAccess: a.menuAccess ?? [] }, "karyawan");

// Karyawan yang pengajuannya diputus penyetuju ini: bawahan langsungnya.
export function requesterFilter(a: Approver) {
  return { id: { not: a.id }, managerId: a.id };
}

export async function hasApprover(userId: string) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { managerId: true, manager: { select: { isActive: true } } } });
  return !!(u?.managerId && u.managerId !== userId && u.manager?.isActive);
}

// Nama penyetuju pertama untuk pemberitahuan "diajukan ke … untuk approval": level Workflow pertama, atau atasan langsung.
export async function firstApproverName(flow: { steps: { name: string }[] } | null, userId: string) {
  if (flow?.steps.length) return flow.steps[0].name;
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { manager: { select: { name: true } } } });
  return u?.manager?.name ?? "atasan langsung";
}

export async function canDecide(a: Approver, requesterId: string) {
  if (requesterId === a.id) return false;
  const u = await prisma.user.findUnique({ where: { id: requesterId }, select: { managerId: true } });
  return u?.managerId === a.id;
}

// Jumlah pengajuan yang menunggu keputusan penyetuju ini (untuk badge menu).
export async function pendingApprovals(a: Approver) {
  const user = requesterFilter(a);
  const [leaves, trips, profiles, swaps, interviews, workflow, edits, ots, loans, fixes] = await Promise.all([
    prisma.leaveRequest.count({ where: { status: "PENDING", user, ...noWorkflow } }),
    prisma.businessTrip.count({ where: { status: "PENDING", user, ...noWorkflow } }),
    // Perubahan data: tanpa Workflow → Admin Data Karyawan; dengan Workflow → penyetuju level yang sedang berjalan.
    prisma.profileChangeRequest.findMany({ where: { status: "PENDING", userId: { not: a.id } }, select: { approval: true } })
      .then((list) => list.filter((r) => { const f = readApproval(r.approval); return f ? actionableApprovers(f).includes(a.id) : reviewsProfiles(a); }).length),
    pendingSwapApprovals(a.id),
    pendingInterviewApprovals(a.id),
    pendingWorkflowRequests(a.id),
    prisma.employeeEditRequest.count({ where: { approverId: a.id, status: "PENDING" } }),
    prisma.overtime.count({ where: { status: "PENDING", user, ...noWorkflow } }),
    // Pinjaman: atasan langsung di tahap ATASAN, pimpinan puncak di tahap PIMPINAN.
    prisma.employeeLoan.findMany({
      where: { status: "PENDING" },
      select: { status: true, stage: true, flow: true, userId: true },
    }).then((list) => {
      const admin = canEditMenu({ role: a.role, menuAccess: a.menuAccess ?? [] }, "pinjaman");
      return list.filter((l) => { const f = readLoanFlow(l.flow); return loanTurn(l.status, l.stage, f, a.id) || loanReviewTurn(l.status, l.stage, f, a.id, l.userId, admin); }).length;
    }),
    prisma.attendanceCorrection.count({ where: { status: "PENDING", user, ...noWorkflow } }),
  ]);
  return leaves + trips + profiles + swaps + interviews + workflow + edits + ots + loans + fixes;
}

// Menu Persetujuan tampil untuk atasan (punya bawahan langsung) dan Admin Data Karyawan (perubahan data).
export async function isApprover(a: Approver) {
  if (reviewsProfiles(a)) return true;
  // Pemeriksa dokumen pinjaman (Admin berhak Edit Pinjaman) melihat kartu pengajuan yang perlu diperiksa.
  if (canEditMenu({ role: a.role, menuAccess: a.menuAccess ?? [] }, "pinjaman")) return true;
  if (await isInterviewApprover(a.id)) return true;
  if (await isWorkflowApprover(a.id)) return true;
  // Delegasi tanggung jawab dari karyawan yang cuti.
  if (await prisma.leaveRequest.count({ where: { delegateId: a.id, status: "APPROVED", endDate: { gte: new Date(Date.now() - 30 * 86_400_000) } } })) return true;
  // Atasan dari Admin berhak "Ajukan" yang punya pengajuan ubah data karyawan.
  if (await prisma.employeeEditRequest.count({ where: { approverId: a.id } })) return true;
  return (await prisma.user.count({ where: { managerId: a.id } })) > 0;
}
