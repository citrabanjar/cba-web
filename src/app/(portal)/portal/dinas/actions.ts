"use server";

import { auth } from "@/auth";
import { submitTripFor } from "@/lib/request-submit";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

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
  return submitTripFor({ id: session.user.id, name: session.user.name ?? null }, {
    destination: formData.get("destination") as string, purpose: formData.get("purpose") as string,
    startDate: formData.get("startDate") as string, endDate: formData.get("endDate") as string,
  });
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
