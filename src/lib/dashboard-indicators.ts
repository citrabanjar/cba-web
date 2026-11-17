// Daftar kartu indikator yang bisa dipasang di running indikator Beranda (tampil untuk Super Admin dan Admin).
// Super Admin memilih mana yang tampil di Pengaturan → Running Indikator; yang dimatikan disimpan di AppSetting.
// Indikator ditambah satu per satu sesuai review pemilik.

export const INDICATOR_SETTING_KEY = "dashboard.indicators";

export const INDICATOR_CATALOG = [
  { key: "dinas-hari-ini", title: "Dinas Hari Ini", desc: "Karyawan yang sedang dinas luar (disetujui) hari ini." },
  { key: "terlambat-hari-ini", title: "Terlambat Hari Ini", desc: "Karyawan yang check-in melewati jam masuk shift + toleransi hari ini." },
  { key: "tepat-waktu-hari-ini", title: "Tepat Waktu Hari Ini", desc: "Karyawan yang check-in tepat waktu sesuai shift hari ini." },
  { key: "cuti-berjalan", title: "Proses Cuti", desc: "Pengajuan cuti yang menunggu persetujuan dan karyawan yang sedang cuti hari ini (sudah disetujui). Hilang sendiri saat keduanya 0." },
  { key: "proses-pinjaman", title: "Proses Pinjaman", desc: "Pengajuan pinjaman per tahap: menunggu atasan, pemeriksaan Admin, menunggu keputusan pemutus, dan yang selesai diputus hari ini (hilang saat berganti hari). Hilang sendiri saat tidak ada proses." },
  { key: "pengajuan-menunggu", title: "Pengajuan Menunggu", desc: "Semua pengajuan karyawan yang belum diputus per modul: Cuti, Dinas, Lembur, Pinjaman, Tukar Shift (termasuk pengajuan uji masa testing). Hilang sendiri saat semua 0." },
  { key: "perubahan-data", title: "Perubahan Data Belum Disetujui", desc: "Perubahan data yang diajukan Admin (Data Karyawan, Payroll & Benefit) dan karyawan (Profil Saya) yang belum diputus. Hilang sendiri saat semua sudah diputus." },
] as const;

export type IndicatorKey = (typeof INDICATOR_CATALOG)[number]["key"];

// Dipakai kalau Super Admin belum pernah menyimpan pilihan: semua kartu mati, dinyalakan sesuai kebutuhan.
export const DEFAULT_HIDDEN_INDICATORS: string[] = INDICATOR_CATALOG.map((i) => i.key);
