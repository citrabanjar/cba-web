"use server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { isManagement, isSuperAdmin } from "@/lib/roles";
import { getAccess } from "@/lib/access";
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

// Simpan kartu running indikator Beranda yang dimatikan. Khusus Super Admin.
export async function saveHiddenIndicators(hidden: string[]): Promise<{ error?: string }> {
  const session = await auth();
  const access = await getAccess();
  if (!session?.user || !access || !isSuperAdmin(access.role)) return { error: "Unauthorized" };
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

// Password massal (Pengaturan → Akun, khusus Super Admin): satu password untuk semua akun Karyawan & Admin.
// Akun Super Admin tidak diubah. Password diketik sendiri oleh Super Admin di portal.
export async function setBulkPassword(password: string): Promise<{ error?: string; count?: number }> {
  const access = await getAccess();
  if (!access || !isSuperAdmin(access.role)) return { error: "Hanya Super Admin yang dapat melakukan ini." };
  if (typeof password !== "string" || password.length < 8) return { error: "Password minimal 8 karakter." };
  const hash = await bcrypt.hash(password, 12);
  const r = await prisma.user.updateMany({ where: { role: { not: "SUPER_ADMIN" } }, data: { passwordHash: hash } });
  return { count: r.count };
}
