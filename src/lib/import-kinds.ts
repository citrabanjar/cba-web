// Jenis Import Data (Pengaturan -> tab Import Data). Aman dipakai di server dan browser.
// - Super Admin mencentang "Beri Akses" per jenis: jenis yang dicentang bisa dipakai Admin berkewenangan Import Data.
// - Kewenangan Admin satu saja: "import" di menuAccess (Peran Admin -> Import Data: Boleh) = semua jenis yang diberi akses.
//   Isian "import:<jenis>" (sempat dipakai) dianggap sama dengan "import". Karyawan baru masuk lewat Pra-Karyawan.
export const IMPORT_KINDS = [
  { key: "karyawan", label: "Import Data Karyawan", desc: "Tambah banyak karyawan sekaligus dari file Excel (template berisi data yang sudah ada)." },
  { key: "foto", label: "Import Foto Karyawan", desc: "Upload banyak foto karyawan sekaligus; nama file = ID Karyawan." },
  { key: "saldo-cuti", label: "Import Saldo Cuti", desc: "Saldo awal cuti dari aplikasi lama." },
  { key: "saldo-pinjaman", label: "Import Saldo Pinjaman", desc: "Saldo awal pinjaman yang masih berjalan dari aplikasi lama." },
  { key: "organisasi", label: "Import Parameter Organisasi", desc: "Cabang, departemen, dan jabatan dari file Excel." },
] as const;

export type ImportKind = (typeof IMPORT_KINDS)[number]["key"];
export const IMPORT_PREFIX = "import:";
export const isImportKind = (k: string): k is ImportKind => IMPORT_KINDS.some((x) => x.key === k);
// Default "Beri Akses" sebelum Super Admin mengatur: yang dulu termasuk kewenangan Import Data.
export const DEFAULT_IMPORT_ENABLED: ImportKind[] = ["karyawan", "foto"];

export const hasImportRight = (menuAccess: string[]) => menuAccess.some((m) => m === "import" || m.startsWith(IMPORT_PREFIX));

// Jenis import yang boleh dipakai user: Super Admin semua; Admin berkewenangan Import Data = semua yang diberi akses.
export function importKindsFor(user: { role: string; menuAccess: string[] } | null | undefined, enabled: string[]): ImportKind[] {
  if (!user) return [];
  if (user.role === "SUPER_ADMIN") return IMPORT_KINDS.map((k) => k.key);
  if (user.role !== "ADMIN") return [];
  return hasImportRight(user.menuAccess) ? IMPORT_KINDS.map((k) => k.key).filter((k) => enabled.includes(k)) : [];
}
