// Aturan peran yang tidak menyentuh database, jadi aman dipakai di middleware dan client.
//
// SUPER_ADMIN bukan karyawan: tanpa ID karyawan, login dengan email, dan tidak punya
// menu pribadi. ADMIN adalah karyawan yang dibukakan menu tertentu oleh super admin,
// jadi sesama admin bisa punya akses berbeda.

// levels: tingkat kewenangan yang bisa dipilih. "view" = lihat saja, "propose" = ajukan perubahan (berlaku setelah
// disetujui atasan langsung si Admin), "edit" = lihat dan ubah langsung.
// Di menuAccess: edit = "karyawan", ajukan = "karyawan:ajukan", lihat saja = "karyawan:lihat".
export const MENUS = [
  { key: "karyawan", label: "Data Karyawan", desc: "Lihat dan ubah data karyawan", levels: ["view", "propose", "edit"] },
  { key: "gaji", label: "Gaji & Payroll", desc: "Lihat gaji, riwayat gaji, dan slip gaji", levels: ["view", "edit"] },
  { key: "import", label: "Import Data", desc: "Upload data karyawan dari Excel", levels: ["edit"] },
  { key: "perusahaan", label: "Company", desc: "Lihat struktur organisasi perusahaan", levels: ["view"] },
  { key: "absensi", label: "Absensi & Cuti", desc: "Schedule, jadwal kerja, aturan absensi, jenis & saldo cuti", levels: ["view", "edit"] },
  { key: "prakaryawan", label: "Pra-Karyawan", desc: "Rekrutmen dan onboarding calon karyawan", levels: ["view", "edit"] },
  { key: "pinjaman", label: "Pinjaman Karyawan", desc: "Kelola pinjaman dan cicilan karyawan", levels: ["view", "edit"] },
  // Workflow tidak lagi kewenangan Admin: diatur Super Admin (keputusan pemilik 2026-11-14).
  { key: "pengaturan", label: "Pengaturan", desc: "Task Admin, Agent HRD, dan running indikator Beranda", levels: ["view", "edit"] },
] as const;

export type MenuKey = (typeof MENUS)[number]["key"];
export type MenuLevel = "view" | "propose" | "edit";
export const VIEW_SUFFIX = ":lihat";
export const PROPOSE_SUFFIX = ":ajukan";

// Tingkat kewenangan satu menu dari daftar menuAccess (edit menang atas ajukan, ajukan menang atas lihat).
export function menuLevelOf(menuAccess: string[], menu: string): MenuLevel | null {
  if (menuAccess.includes(menu)) return "edit";
  if (menuAccess.includes(menu + PROPOSE_SUFFIX)) return "propose";
  if (menuAccess.includes(menu + VIEW_SUFFIX)) return "view";
  return null;
}
export const menuEntry = (menu: string, level: MenuLevel) => (level === "view" ? menu + VIEW_SUFFIX : level === "propose" ? menu + PROPOSE_SUFFIX : menu);
export const LEVEL_LABEL: Record<MenuLevel, string> = { view: "Lihat", propose: "Ajukan", edit: "Edit" };

export function isSuperAdmin(role: string | null | undefined): boolean {
  return role === "SUPER_ADMIN";
}

export function isManagement(role: string | null | undefined): boolean {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

// Boleh membuka (melihat) menu: hak lihat atau edit.
export function hasMenu(
  user: { role: string; menuAccess: string[] } | null | undefined,
  menu: MenuKey,
): boolean {
  if (!user) return false;
  if (user.role === "SUPER_ADMIN") return true;
  return user.role === "ADMIN" && menuLevelOf(user.menuAccess, menu) !== null;
}

// Boleh mengubah data di menu: hanya hak edit (Super Admin selalu boleh).
export function canEditMenu(
  user: { role: string; menuAccess: string[] } | null | undefined,
  menu: MenuKey,
): boolean {
  if (!user) return false;
  if (user.role === "SUPER_ADMIN") return true;
  return user.role === "ADMIN" && menuLevelOf(user.menuAccess, menu) === "edit";
}

export function roleLabel(role: string): string {
  return role.replace("_", " ");
}

// Boleh mengubah data lewat pengajuan (berlaku setelah disetujui atasan langsung). Edit langsung tidak termasuk.
export function canProposeMenu(
  user: { role: string; menuAccess: string[] } | null | undefined,
  menu: MenuKey,
): boolean {
  if (!user || user.role !== "ADMIN") return false;
  return menuLevelOf(user.menuAccess, menu) === "propose";
}
