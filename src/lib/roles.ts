// Aturan peran yang tidak menyentuh database, jadi aman dipakai di middleware dan client.
//
// SUPER_ADMIN bukan karyawan: tanpa ID karyawan, login dengan email, dan tidak punya
// menu pribadi. ADMIN adalah karyawan yang dibukakan menu tertentu oleh super admin,
// jadi sesama admin bisa punya akses berbeda.

export const MENUS = [
  { key: "karyawan", label: "Data Karyawan", desc: "Lihat dan ubah data karyawan" },
  { key: "gaji", label: "Gaji & Payroll", desc: "Lihat gaji, riwayat gaji, dan slip gaji" },
  { key: "import", label: "Import Data", desc: "Upload data karyawan dari Excel" },
  { key: "perusahaan", label: "Company", desc: "Lihat struktur organisasi perusahaan" },
] as const;

export type MenuKey = (typeof MENUS)[number]["key"];

export function isSuperAdmin(role: string | null | undefined): boolean {
  return role === "SUPER_ADMIN";
}

export function isManagement(role: string | null | undefined): boolean {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

export function hasMenu(
  user: { role: string; menuAccess: string[] } | null | undefined,
  menu: MenuKey,
): boolean {
  if (!user) return false;
  if (user.role === "SUPER_ADMIN") return true;
  return user.role === "ADMIN" && user.menuAccess.includes(menu);
}

export function roleLabel(role: string): string {
  return role.replace("_", " ");
}
