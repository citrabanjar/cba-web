import { prisma } from "@/lib/prisma";
import { isManagement } from "@/lib/roles";

// Jalur persetujuan cuti & dinas luar (sementara, keputusan pemilik 2026-11-10):
// penyetuju = ATASAN LANGSUNG yang aktif. Karyawan tanpa atasan langsung, atau atasannya tidak aktif,
// disetujui Admin/HRD (Admin & Super Admin). Tidak boleh menyetujui pengajuan sendiri.
// Nanti diganti/diatur lewat menu Workflow (lihat ceklist), dan workflow yang menang.

export type Approver = { id: string; role: string };

// Filter karyawan yang pengajuannya boleh diputus oleh penyetuju ini.
export function requesterFilter(a: Approver) {
  const mine = { managerId: a.id, manager: { isActive: true } };
  const orphan = isManagement(a.role) ? [{ managerId: null }, { manager: { isActive: false } }] : [];
  return { id: { not: a.id }, OR: [mine, ...orphan] };
}

export async function canDecide(a: Approver, requesterId: string) {
  if (requesterId === a.id) return false;
  const u = await prisma.user.findUnique({ where: { id: requesterId }, select: { managerId: true, manager: { select: { isActive: true } } } });
  if (!u) return false;
  if (u.managerId === a.id && u.manager?.isActive) return true;
  return isManagement(a.role) && (!u.managerId || !u.manager?.isActive);
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

// Menu Persetujuan tampil untuk Admin/Super Admin dan karyawan yang punya bawahan aktif.
export async function isApprover(a: Approver) {
  if (isManagement(a.role)) return true;
  return (await prisma.user.count({ where: { managerId: a.id, isActive: true } })) > 0;
}
