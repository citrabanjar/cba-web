// Daftar semua kartu indikator yang bisa dipasang di running indikator Beranda admin.
// Super Admin memilih mana yang tampil di Pengaturan; yang dimatikan disimpan di AppSetting.

export const INDICATOR_SETTING_KEY = "dashboard.indicators";

export const INDICATOR_CATALOG = [
  { key: "schedule", title: "Shift Belum Diisi", desc: "Hari kerja bulan ini yang belum punya shift. Hilang sendiri saat sudah beres." },
  { key: "present", title: "Hadir Hari Ini", desc: "Jumlah karyawan hadir hari ini dibanding kemarin." },
  { key: "absent", title: "Tidak Hadir Hari Ini", desc: "Jumlah karyawan tidak hadir hari ini dibanding kemarin." },
  { key: "contract", title: "Kontrak Berakhir", desc: "Kontrak yang berakhir dalam 60 hari. Hilang sendiri saat tidak ada." },
  { key: "leave", title: "Cuti Menunggu", desc: "Pengajuan cuti yang belum diputus. Hilang sendiri saat tidak ada." },
  { key: "trip", title: "Dinas Menunggu", desc: "Pengajuan dinas luar yang belum diputus. Hilang sendiri saat tidak ada." },
  { key: "birthday", title: "Ulang Tahun Bulan Ini", desc: "Jumlah karyawan yang berulang tahun bulan ini dan siapa berikutnya." },
  { key: "holiday", title: "Libur Berikutnya", desc: "Hari libur terdekat dari Kalender Libur." },
  { key: "total", title: "Total Karyawan", desc: "Jumlah karyawan aktif dan yang masuk tahun ini." },
  { key: "departments", title: "Departemen", desc: "Jumlah departemen, termasuk grup di dalamnya." },
] as const;

export type IndicatorKey = (typeof INDICATOR_CATALOG)[number]["key"];

// Dipakai kalau Super Admin belum pernah menyimpan pilihan.
export const DEFAULT_HIDDEN_INDICATORS: string[] = ["total", "departments"];
