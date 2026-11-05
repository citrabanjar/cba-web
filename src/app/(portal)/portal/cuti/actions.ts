"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function getLeaveRequests() {
  const session = await auth();
  if (!session?.user?.id) return [];

  return prisma.leaveRequest.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  });
}

export async function submitLeave(_prevState: unknown, formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Sesi tidak valid, silakan login ulang." };

  const leaveType = formData.get("leaveType") as string;
  const startDate = formData.get("startDate") as string;
  const endDate = formData.get("endDate") as string;
  const reason = formData.get("reason") as string;

  if (!leaveType || !startDate || !endDate || !reason) {
    return { error: "Semua field wajib diisi." };
  }

  const start = new Date(startDate);
  const end = new Date(endDate);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return { error: "Tanggal tidak valid." };
  }
  if (end < start) {
    return { error: "Tanggal akhir tidak boleh sebelum tanggal mulai." };
  }

  const totalDays = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;

  await prisma.leaveRequest.create({
    data: {
      userId: session.user.id,
      type: leaveType as any,
      startDate: start,
      endDate: end,
      totalDays,
      reason,
      status: "PENDING",
    },
  });

  revalidatePath("/portal/cuti");
  return { ok: true, days: totalDays };
}

export async function cancelLeave(id: string) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Sesi tidak valid." };

  const req = await prisma.leaveRequest.findUnique({ where: { id } });
  if (!req || req.userId !== session.user.id) return { error: "Pengajuan tidak ditemukan." };
  if (req.status !== "PENDING") return { error: "Hanya pengajuan yang masih PENDING yang bisa dibatalkan." };

  await prisma.leaveRequest.update({
    where: { id },
    data: { status: "CANCELLED" },
  });

  revalidatePath("/portal/cuti");
  return { ok: true };
}
