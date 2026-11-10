import { prisma } from "@/lib/prisma";

// Jalur persetujuan cuti & dinas luar (keputusan pemilik 2026-11-10): penyetuju = ATASAN LANGSUNG
// yang aktif. Karyawan tanpa atasan aktif tidak bisa mengirim pengajuan (ditolak saat dikirim), dan
// Task Admin mengingatkan HRD untuk mengisi atasannya. Tidak ada jalur cadangan ke HRD.
// Nanti diatur lewat menu Workflow (lihat ceklist), dan workflow yang menang.

export type Approver = { id: string; role: string };

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
  const [leaves, trips] = await Promise.all([
    prisma.leaveRequest.count({ where: { status: "PENDING", user } }),
    prisma.businessTrip.count({ where: { status: "PENDING", user } }),
  ]);
  return leaves + trips;
}

// Menu Persetujuan tampil untuk siapa pun (termasuk Admin) yang punya bawahan langsung.
export async function isApprover(a: Approver) {
  return (await prisma.user.count({ where: { managerId: a.id } })) > 0;
}
