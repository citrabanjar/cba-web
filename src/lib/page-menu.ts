import type { MenuKey } from "@/lib/roles";

// Menu admin yang menguasai sebuah alamat halaman (dipakai tampilan browser dan penyaring Task Admin di server).
const PAGE_MENU: [string, MenuKey][] = [
  ["/portal/admin/karyawan", "karyawan"],
  ["/portal/admin/schedule", "absensi"],
  ["/portal/admin/jadwal", "absensi"],
  ["/portal/admin/leave", "absensi"],
  ["/portal/admin/lembur", "spl"],
  ["/portal/admin/rekap", "absensi"],
  ["/portal/admin/laporan", "absensi"],
  ["/portal/admin/payroll", "gaji"],
  ["/portal/admin/pinjaman", "pinjaman"],
  ["/portal/admin/onboarding", "prakaryawan"],
  ["/portal/admin/settings", "pengaturan"],
  ["/portal/admin/pengumuman", "pengaturan"],
  ["/portal/admin/helpdesk", "pengaturan"],
];
export const pageMenu = (path: string): MenuKey | null => PAGE_MENU.find(([p]) => path === p || path.startsWith(p + "/"))?.[1] ?? null;
