// "Persetujuan" (antrean keputusan untuk atasan/approver/Admin) bukan modul notifikasi; ditambahkan halaman Notifikasi.
// Pengelompokan notifikasi per modul (aman dipakai di server dan browser). Modul ditentukan dari tautan notifikasi.
export const NOTIF_MODULES = [
  { key: "kehadiran", label: "Kehadiran", paths: ["/portal/absensi", "/portal/kehadiran", "/portal/tukar-shift"] },
  { key: "lembur", label: "Lembur", paths: ["/portal/lembur", "/portal/admin/lembur"] },
  { key: "cuti", label: "Cuti", paths: ["/portal/cuti"] },
  { key: "dinas", label: "Dinas", paths: ["/portal/dinas"] },
  { key: "pinjaman", label: "Pinjaman", paths: ["/portal/pinjaman"] },
  { key: "profil", label: "Data Diri", paths: ["/portal/profil"] },
  { key: "payroll", label: "Payroll & Benefit", paths: ["/portal/admin/payroll"] },
  { key: "karyawan", label: "Data Karyawan", paths: ["/portal/admin/karyawan"] },
  { key: "lainnya", label: "Lainnya", paths: [] as string[] },
] as const;

export type NotifModule = (typeof NOTIF_MODULES)[number]["key"];

// Hasil pengajuan perubahan oleh Admin ("Pengajuan disetujui: <judul>") masuk ke kategori menunya: Payroll & Benefit
// (gaji, komponen, PPh 21/TER, finalisasi) atau Data Karyawan.
const ADMIN_DECISION = /^Pengajuan (disetujui|ditolak): /;
const PAYROLL_TITLE = /payroll|gaji|komponen|pph|ter/i;

export function moduleOf(href: string | null, title = ""): NotifModule {
  if (ADMIN_DECISION.test(title)) return PAYROLL_TITLE.test(title.replace(ADMIN_DECISION, "")) ? "payroll" : "karyawan";
  const path = (href ?? "").split("?")[0];
  return NOTIF_MODULES.find((m) => m.paths.some((p) => path === p || path.startsWith(`${p}/`)))?.key ?? "lainnya";
}
