import { prisma } from "@/lib/prisma";
import { hasMenu } from "@/lib/roles";
import { pendingSwapApprovals } from "@/lib/shift-swap";

// Jalur persetujuan cuti & dinas luar (keputusan pemilik 2026-11-10): penyetuju = ATASAN LANGSUNG
// yang aktif. Karyawan tanpa atasan aktif tidak bisa mengirim pengajuan (ditolak saat dikirim), dan
// Task Admin mengingatkan HRD untuk mengisi atasannya. Tidak ada jalur cadangan ke HRD.
// Nanti diatur lewat menu Workflow (lihat ceklist), dan workflow yang menang.

export type Approver = { id: string; role: string; menuAccess?: string[] };

// Perubahan data pribadi (Profil Saya) diputus Admin yang punya akses menu Data Karyawan.
export const reviewsProfiles = (a: Approver) => hasMenu({ role: a.role, menuAccess: a.menuAccess ?? [] }, "karyawan");

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
  const [leaves, trips, profiles, swaps] = await Promise.all([
    prisma.leaveRequest.count({ where: { status: "PENDING", user } }),
    prisma.businessTrip.count({ where: { status: "PENDING", user } }),
    reviewsProfiles(a) ? prisma.profileChangeRequest.count({ where: { status: "PENDING", userId: { not: a.id } } }) : 0,
    pendingSwapApprovals(a.id),
  ]);
  return leaves + trips + profiles + swaps;
}

// Menu Persetujuan tampil untuk atasan (punya bawahan langsung) dan Admin Data Karyawan (perubahan data).
export async function isApprover(a: Approver) {
  if (reviewsProfiles(a)) return true;
  return (await prisma.user.count({ where: { managerId: a.id } })) > 0;
}
