"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getAccess } from "@/lib/access";
import { canDecide } from "@/lib/approval";
import { assessAttendance } from "@/lib/attendance-assess";

type Result = { error?: string };

async function approver() {
  const session = await auth();
  const access = await getAccess();
  if (!session?.user?.id || !access) throw new Error("Unauthorized");
  return { id: session.user.id, role: access.role, name: session.user.name ?? null };
}

function refresh() {
  for (const p of ["/portal/persetujuan", "/portal/cuti", "/portal/dinas", "/portal/dashboard", "/portal/admin/leave"]) revalidatePath(p);
  revalidatePath("/portal/admin/karyawan", "layout");
}

// Setujui atau tolak pengajuan cuti. Alasan wajib saat menolak.
export async function decideLeave(id: string, approve: boolean, note: string): Promise<Result> {
  const a = await approver();
  const req = await prisma.leaveRequest.findUnique({ where: { id } });
  if (!req || req.status !== "PENDING") return { error: "Pengajuan tidak ditemukan atau sudah diputus." };
  if (!(await canDecide(a, req.userId))) return { error: "Anda bukan penyetuju pengajuan ini." };
  if (!approve && !note.trim()) return { error: "Tulis alasan penolakan." };
  await prisma.leaveRequest.update({
    where: { id },
    data: { status: approve ? "APPROVED" : "REJECTED", approvedBy: a.name, approvedAt: new Date(), note: note.trim() || null },
  });
  // Alpha otomatis di tanggal cuti yang disetujui langsung dihapus.
  if (approve) await assessAttendance(req.startDate, req.endDate, [req.userId]);
  refresh();
  return {};
}

export async function decideTrip(id: string, approve: boolean, note: string): Promise<Result> {
  const a = await approver();
  const trip = await prisma.businessTrip.findUnique({ where: { id } });
  if (!trip || trip.status !== "PENDING") return { error: "Pengajuan tidak ditemukan atau sudah diputus." };
  if (!(await canDecide(a, trip.userId))) return { error: "Anda bukan penyetuju pengajuan ini." };
  if (!approve && !note.trim()) return { error: "Tulis alasan penolakan." };
  await prisma.businessTrip.update({
    where: { id },
    data: { status: approve ? "APPROVED" : "REJECTED", approvedBy: a.name, approvedAt: new Date(), note: note.trim() || null },
  });
  if (approve) await assessAttendance(trip.startDate, trip.endDate, [trip.userId]);
  refresh();
  return {};
}
