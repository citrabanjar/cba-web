"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// Tandai notifikasi sudah dibaca (satu / beberapa id, atau semua bila kosong).
export async function markNotificationsRead(id?: string | string[]) {
  const session = await auth();
  if (!session?.user?.id) return;
  await prisma.notification.updateMany({ where: { userId: session.user.id, readAt: null, ...(Array.isArray(id) ? { id: { in: id } } : id ? { id } : {}) }, data: { readAt: new Date() } });
  revalidatePath("/portal", "layout");
}
