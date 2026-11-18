"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { fixRefresh, submitFixFor, type FixInput } from "@/lib/attendance-fix";

export async function submitFix(input: FixInput) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Sesi tidak valid, silakan login ulang." };
  return submitFixFor({ id: session.user.id, name: session.user.name ?? null }, input);
}

export async function cancelFix(id: string) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Sesi tidak valid." };
  const f = await prisma.attendanceCorrection.findUnique({ where: { id } });
  if (!f || f.userId !== session.user.id) return { error: "Data tidak ditemukan." };
  if (f.status !== "PENDING") return { error: "Hanya pengajuan yang menunggu persetujuan yang bisa dibatalkan." };
  await prisma.attendanceCorrection.update({ where: { id }, data: { status: "CANCELLED" } });
  fixRefresh();
  return {};
}
