"use server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { isManagement, isSuperAdmin } from "@/lib/roles";
import { revalidatePath } from "next/cache";
import { INDICATOR_CATALOG, INDICATOR_SETTING_KEY } from "@/lib/dashboard-indicators";
import bcrypt from "bcryptjs";

export async function changeAdminPassword(
  currentPassword: string,
  newPassword: string,
) {
  const session = await auth();
  if (!session?.user || !isManagement(session.user.role)) {
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

// Simpan kartu running indikator Beranda yang dimatikan. Khusus Admin (setup detail).
export async function saveHiddenIndicators(hidden: string[]): Promise<{ error?: string }> {
  const session = await auth();
  if (!session?.user || !isManagement(session.user.role) || isSuperAdmin(session.user.role)) return { error: "Unauthorized" };
  const known = new Set<string>(INDICATOR_CATALOG.map((i) => i.key));
  const value = { hidden: [...new Set(hidden)].filter((k) => known.has(k)) };
  await prisma.appSetting.upsert({
    where: { key: INDICATOR_SETTING_KEY },
    update: { value, updatedBy: session.user.name ?? null },
    create: { key: INDICATOR_SETTING_KEY, value, updatedBy: session.user.name ?? null },
  });
  revalidatePath("/portal/dashboard");
  revalidatePath("/portal/admin/settings");
  return {};
}
