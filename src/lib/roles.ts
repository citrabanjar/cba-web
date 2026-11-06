// SUPER_ADMIN bukan karyawan: tanpa NIK, login dengan email, dan tidak punya menu pribadi.
export function isSuperAdmin(role: string | null | undefined): boolean {
  return role === "SUPER_ADMIN";
}

// Boleh mengakses fitur pengelolaan (data karyawan, pengaturan, dan seterusnya).
export function canManage(role: string | null | undefined): boolean {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

export function roleLabel(role: string): string {
  return role.replace("_", " ");
}
