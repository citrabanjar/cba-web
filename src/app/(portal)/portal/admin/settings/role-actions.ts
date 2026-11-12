"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/access";
import { saveAdminRoles, type AdminRole } from "@/lib/admin-roles";

// Simpan Peran Admin beserta anggotanya (Super Admin). Hak menu anggota langsung disesuaikan.
export async function saveRoles(roles: AdminRole[]): Promise<{ error?: string }> {
  const actor = await requireSuperAdmin();
  const names = roles.map((r) => r.name.trim().toLowerCase());
  if (names.some((n) => !n)) return { error: "Nama peran wajib diisi." };
  if (new Set(names).size !== names.length) return { error: "Nama peran tidak boleh sama." };
  await saveAdminRoles(roles, actor.name);
  revalidatePath("/portal/admin/settings");
  revalidatePath("/portal", "layout");
  return {};
}
