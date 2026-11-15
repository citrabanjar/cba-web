"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getAccess } from "@/lib/access";
import { isSuperAdmin } from "@/lib/roles";
import { isImportKind } from "@/lib/import-kinds";
import { IMPORT_SETTING_KEY } from "@/lib/import-access";

// Centang "Beri Akses" per jenis import (Super Admin). Jenis yang tidak dicentang tidak muncul di kewenangan Peran Admin
// dan tidak bisa dipakai Admin (walau perannya masih menyimpan kewenangan itu).
export async function saveImportAccess(enabled: string[]): Promise<{ error?: string }> {
  const access = await getAccess();
  if (!access || !isSuperAdmin(access.role)) return { error: "Hanya Super Admin." };
  const list = [...new Set(enabled.filter(isImportKind))];
  await prisma.appSetting.upsert({
    where: { key: IMPORT_SETTING_KEY },
    update: { value: { enabled: list }, updatedBy: access.name ?? null },
    create: { key: IMPORT_SETTING_KEY, value: { enabled: list }, updatedBy: access.name ?? null },
  });
  revalidatePath("/portal", "layout");
  return {};
}
