import { prisma } from "@/lib/prisma";
import { canEditMenu } from "@/lib/roles";
import { pendingSwapApprovals } from "@/lib/shift-swap";
import { isInterviewApprover, pendingInterviewApprovals } from "@/lib/onboarding-settings";
import { isWorkflowApprover } from "@/lib/workflow-settings";
import { actionableApprovers, readApproval } from "@/lib/onboarding-interview";
import { Prisma } from "@prisma/client";

// Pengajuan cuti/dinas tanpa jejak workflow = jalur atasan langsung.
export const noWorkflow = { approval: { equals: Prisma.DbNull } };
const withWorkflow = { approval: { not: Prisma.DbNull } };

// Cuti/dinas lewat menu Workflow yang menunggu keputusan user ini (giliran levelnya).
async function pendingWorkflowRequests(userId: string) {
  const [leaves, trips] = await Promise.all([
    prisma.leaveRequest.findMany({ where: { status: "PENDING", ...withWorkflow }, select: { approval: true } }),
    prisma.businessTrip.findMany({ where: { status: "PENDING", ...withWorkflow }, select: { approval: true } }),
  ]);
  return [...leaves, ...trips].filter((r) => actionableApprovers(readApproval(r.approval)).includes(userId)).length;
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

export async function canDecide(a: Approver, requesterId: string) {
  if (requesterId === a.id) return false;
  const u = await prisma.user.findUnique({ where: { id: requesterId }, select: { managerId: true } });
  return u?.managerId === a.id;
}

// Jumlah pengajuan yang menunggu keputusan penyetuju ini (untuk badge menu).
export async function pendingApprovals(a: Approver) {
  const user = requesterFilter(a);
  const [leaves, trips, profiles, swaps, interviews, workflow] = await Promise.all([
    prisma.leaveRequest.count({ where: { status: "PENDING", user, ...noWorkflow } }),
    prisma.businessTrip.count({ where: { status: "PENDING", user, ...noWorkflow } }),
    reviewsProfiles(a) ? prisma.profileChangeRequest.count({ where: { status: "PENDING", userId: { not: a.id } } }) : 0,
    pendingSwapApprovals(a.id),
    pendingInterviewApprovals(a.id),
    pendingWorkflowRequests(a.id),
  ]);
  return leaves + trips + profiles + swaps + interviews + workflow;
}

// Menu Persetujuan tampil untuk atasan (punya bawahan langsung) dan Admin Data Karyawan (perubahan data).
export async function isApprover(a: Approver) {
  if (reviewsProfiles(a)) return true;
  if (await isInterviewApprover(a.id)) return true;
  if (await isWorkflowApprover(a.id)) return true;
  return (await prisma.user.count({ where: { managerId: a.id } })) > 0;
}
