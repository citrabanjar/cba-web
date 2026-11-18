// Pengelompokan notifikasi per modul (aman dipakai di server dan browser). Modul ditentukan dari tautan notifikasi.
export const NOTIF_MODULES = [
  { key: "kehadiran", label: "Kehadiran", paths: ["/portal/absensi", "/portal/kehadiran", "/portal/tukar-shift", "/portal/lupa-absen", "/portal/admin/schedule"] },
  { key: "lembur", label: "Lembur", paths: ["/portal/lembur", "/portal/admin/lembur"] },
  { key: "cuti", label: "Cuti", paths: ["/portal/cuti", "/portal/admin/leave"] },
  { key: "dinas", label: "Dinas", paths: ["/portal/dinas"] },
  { key: "pinjaman", label: "Pinjaman", paths: ["/portal/pinjaman", "/portal/admin/pinjaman"] },
  { key: "profil", label: "Data Diri", paths: ["/portal/profil"] },
  { key: "payroll", label: "Payroll & Benefit", paths: ["/portal/admin/payroll"] },
  { key: "karyawan", label: "Data Karyawan", paths: ["/portal/admin/karyawan"] },
  { key: "prakaryawan", label: "Pra-Karyawan", paths: ["/portal/admin/onboarding"] },
  { key: "lainnya", label: "Lainnya", paths: [] as string[] },
] as const;

export type NotifModule = (typeof NOTIF_MODULES)[number]["key"];

// Hasil pengajuan perubahan oleh Admin ("Pengajuan disetujui: <judul>") masuk ke kategori menunya: Kehadiran ("Absensi: ..."),
// Cuti ("Cuti: ..."), Payroll & Benefit (gaji, komponen, PPh 21/TER, finalisasi) atau Data Karyawan.
const ADMIN_DECISION = /^Pengajuan (disetujui|ditolak): /;
const PAYROLL_TITLE = /payroll|gaji|komponen|pph|ter/i;

export function moduleOf(href: string | null, title = ""): NotifModule {
  if (ADMIN_DECISION.test(title)) {
    const rest = title.replace(ADMIN_DECISION, "");
    if (rest.startsWith("Absensi:")) return "kehadiran";
    if (rest.startsWith("Cuti:")) return "cuti";
    if (rest.startsWith("Pinjaman:")) return "pinjaman";
    return PAYROLL_TITLE.test(rest) ? "payroll" : "karyawan";
  }
  const [path, query = ""] = (href ?? "").split("?");
  // Tautan ke halaman Notifikasi dengan modul tertentu (mis. pengajuan pinjaman untuk penyetuju).
  const asked = new URLSearchParams(query).get("modul");
  if (path === "/portal/notifikasi" && asked) return NOTIF_MODULES.find((m) => m.key === asked)?.key ?? "lainnya";
  return NOTIF_MODULES.find((m) => m.paths.some((p) => path === p || path.startsWith(`${p}/`)))?.key ?? "lainnya";
}
