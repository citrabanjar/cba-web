"use server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { canManage } from "@/lib/roles";
import bcrypt from "bcryptjs";

export async function changeAdminPassword(
  currentPassword: string,
  newPassword: string,
) {
  const session = await auth();
  if (!session?.user || !canManage(session.user.role)) {
    return { error: "Unauthorized" };
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { passwordHash: true },
  });
  if (!user || !user.passwordHash) return { error: "User tidak ditemukan" };

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) return { error: "Password saat ini salah" };

  if (newPassword.length < 8) {
    return { error: "Password baru minimal 8 karakter" };
  }

  const hash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { id: session.user.id },
    data: { passwordHash: hash },
  });

  return { success: true };
}
