// Jenis Import Data (Pengaturan -> tab Import Data). Aman dipakai di server dan browser.
// - Super Admin mencentang "Beri Akses" per jenis; hanya jenis yang dicentang muncul di kewenangan Peran Admin.
// - Kewenangan Admin disimpan di menuAccess sebagai "import:<jenis>". Isian lama "import" (sebelum dipecah)
//   setara dengan Import Data Karyawan dan Import Foto. Karyawan baru masuk lewat Pra-Karyawan (onboarding).
export const IMPORT_KINDS = [
  { key: "karyawan", label: "Import Data Karyawan", desc: "Tambah banyak karyawan sekaligus dari file Excel (template berisi data yang sudah ada)." },
  { key: "foto", label: "Import Foto Karyawan", desc: "Upload banyak foto karyawan sekaligus; nama file = ID Karyawan." },
  { key: "saldo-cuti", label: "Import Saldo Cuti", desc: "Saldo awal cuti dari aplikasi lama." },
  { key: "saldo-pinjaman", label: "Import Saldo Pinjaman", desc: "Saldo awal pinjaman yang masih berjalan dari aplikasi lama." },
  { key: "organisasi", label: "Import Parameter Organisasi", desc: "Cabang, departemen, dan jabatan dari file Excel." },
] as const;

export type ImportKind = (typeof IMPORT_KINDS)[number]["key"];
export const IMPORT_PREFIX = "import:";
export const importEntry = (k: ImportKind) => `${IMPORT_PREFIX}${k}`;
export const isImportKind = (k: string): k is ImportKind => IMPORT_KINDS.some((x) => x.key === k);
// Default "Beri Akses" sebelum Super Admin mengatur: yang dulu termasuk kewenangan Import Data.
export const DEFAULT_IMPORT_ENABLED: ImportKind[] = ["karyawan", "foto"];
export const LEGACY_IMPORT: ImportKind[] = ["karyawan", "foto"];

// Jenis import yang boleh dipakai user: Super Admin semua; Admin = kewenangannya yang diberi akses Super Admin.
export function importKindsFor(user: { role: string; menuAccess: string[] } | null | undefined, enabled: string[]): ImportKind[] {
  if (!user) return [];
  if (user.role === "SUPER_ADMIN") return IMPORT_KINDS.map((k) => k.key);
  if (user.role !== "ADMIN") return [];
  return IMPORT_KINDS.map((k) => k.key).filter((k) =>
    enabled.includes(k) && (user.menuAccess.includes(importEntry(k)) || (user.menuAccess.includes("import") && LEGACY_IMPORT.includes(k))));
}
