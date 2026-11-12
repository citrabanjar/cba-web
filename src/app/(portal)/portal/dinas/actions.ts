"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { hasApprover } from "@/lib/approval";
import { workflowSteps } from "@/lib/workflow-settings";

export async function getBusinessTrips() {
  const session = await auth();
  if (!session?.user?.id) return [];

  return prisma.businessTrip.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  });
}

export async function submitBusinessTrip(_prevState: unknown, formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Sesi tidak valid, silakan login ulang." };
  // Penyetuju = Level workflow Dinas Luar bila aktif (menu Workflow); selain itu atasan langsung aktif.
  const flow = await workflowSteps("DINAS", session.user.id);
  if (!flow && !(await hasApprover(session.user.id))) return { error: "Atasan langsung Anda belum diatur atau sudah tidak aktif, jadi pengajuan belum bisa dikirim. Hubungi HRD." };

  const destination = formData.get("destination") as string;
  const purpose = formData.get("purpose") as string;
  const startDate = formData.get("startDate") as string;
  const endDate = formData.get("endDate") as string;

  if (!destination || !purpose || !startDate || !endDate) {
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

  await prisma.businessTrip.create({
    data: {
      userId: session.user.id,
      ...(flow ? { approval: flow } : {}),
      destination,
      purpose,
      startDate: start,
      endDate: end,
      totalDays,
      status: "PENDING",
    },
  });

  revalidatePath("/portal/dinas");
  return { ok: true, days: totalDays };
}

export async function cancelBusinessTrip(id: string) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Sesi tidak valid." };

  const trip = await prisma.businessTrip.findUnique({ where: { id } });
  if (!trip || trip.userId !== session.user.id) return { error: "Data tidak ditemukan." };
  if (trip.status !== "PENDING") return { error: "Hanya pengajuan PENDING yang bisa dibatalkan." };

  await prisma.businessTrip.update({
    where: { id },
    data: { status: "CANCELLED" },
  });

  revalidatePath("/portal/dinas");
  return { ok: true };
}
