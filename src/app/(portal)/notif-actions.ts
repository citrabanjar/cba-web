"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// Tandai kabar di lonceng sudah dibaca (satu, atau semua bila id kosong).
export async function markNotificationsRead(id?: string) {
  const session = await auth();
  if (!session?.user?.id) return;
  await prisma.notification.updateMany({ where: { userId: session.user.id, readAt: null, ...(id ? { id } : {}) }, data: { readAt: new Date() } });
  revalidatePath("/portal", "layout");
}
