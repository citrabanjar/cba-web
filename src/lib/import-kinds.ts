// Jenis Import Data (Pengaturan -> tab Import Data). Aman dipakai di server dan browser.
// Hanya data dasar yang disiapkan Super Admin: parameter organisasi (rumah karyawan) dan data karyawan.
// Import detail ada di modulnya masing-masing dan mengikuti kewenangan menu itu:
// foto -> Data Karyawan, saldo cuti -> Leave, saldo pinjaman -> Pinjaman.
// - Super Admin mencentang "Beri Akses" per jenis: jenis yang dicentang bisa dipakai Admin berkewenangan Import Data.
// - Kewenangan Admin satu saja: "import" di menuAccess (Peran Admin -> Import Data: Boleh) = semua jenis yang diberi akses.
//   Isian "import:<jenis>" (sempat dipakai) dianggap sama dengan "import". Karyawan baru masuk lewat Pra-Karyawan.
export const IMPORT_KINDS = [
  { key: "organisasi", label: "Import Parameter Organisasi", desc: "Penetapan struktur organisasi perusahaan (cabang, departemen, dan jabatan) secara massal melalui berkas Excel sebagai landasan penempatan karyawan." },
  { key: "karyawan", label: "Import Data Karyawan", desc: "Pendaftaran data induk karyawan secara massal melalui berkas Excel." },
  { key: "pph21pindahan", label: "Import PPh 21 Pindahan", desc: "Data BPA1 pemberi kerja sebelumnya untuk karyawan yang pindah di tahun pajak berjalan, secara massal melalui berkas Excel." },
] as const;

export type ImportKind = (typeof IMPORT_KINDS)[number]["key"];
export const IMPORT_PREFIX = "import:";
export const isImportKind = (k: string): k is ImportKind => IMPORT_KINDS.some((x) => x.key === k);
// Default "Beri Akses" sebelum Super Admin mengatur: yang dulu termasuk kewenangan Import Data.
export const DEFAULT_IMPORT_ENABLED: ImportKind[] = ["karyawan"];

export const hasImportRight = (menuAccess: string[]) => menuAccess.some((m) => m === "import" || m.startsWith(IMPORT_PREFIX));

// Jenis import yang boleh dipakai user: Super Admin semua; Admin berkewenangan Import Data = semua yang diberi akses.
export function importKindsFor(user: { role: string; menuAccess: string[] } | null | undefined, enabled: string[]): ImportKind[] {
  if (!user) return [];
  if (user.role === "SUPER_ADMIN") return IMPORT_KINDS.map((k) => k.key);
  if (user.role !== "ADMIN") return [];
  return hasImportRight(user.menuAccess) ? IMPORT_KINDS.map((k) => k.key).filter((k) => enabled.includes(k)) : [];
}
