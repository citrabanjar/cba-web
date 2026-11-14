// Daftar kartu indikator yang bisa dipasang di running indikator Beranda (tampil untuk Super Admin dan Admin).
// Super Admin memilih mana yang tampil di Pengaturan → Running Indikator; yang dimatikan disimpan di AppSetting.
// Indikator ditambah satu per satu sesuai review pemilik.

export const INDICATOR_SETTING_KEY = "dashboard.indicators";

export const INDICATOR_CATALOG = [
  { key: "cuti-berjalan", title: "Pengajuan Cuti Berjalan", desc: "Pengajuan cuti sejak karyawan mengajukan sampai diputus. Hilang sendiri saat tidak ada yang berjalan." },
] as const;

export type IndicatorKey = (typeof INDICATOR_CATALOG)[number]["key"];

// Dipakai kalau Super Admin belum pernah menyimpan pilihan: semua kartu mati, dinyalakan sesuai kebutuhan.
export const DEFAULT_HIDDEN_INDICATORS: string[] = INDICATOR_CATALOG.map((i) => i.key);
