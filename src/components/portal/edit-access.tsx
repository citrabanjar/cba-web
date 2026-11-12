"use client";

// Hak lihat / edit per menu admin untuk komponen di browser.
// Pemakaian di halaman admin:  const canEdit = useCanEdit();          // menu halaman ini (dari alamat)
//                              const canEditPay = useCanEdit("gaji");  // menu tertentu
// Tombol yang mengubah data (Tambah, Simpan, Hapus, Upload, Proses, Setujui/Tolak, dll.) disembunyikan bila canEdit = false.
// Server tetap menolak aksi ubah dari pemegang hak lihat (requireMenu / canEditMenu), jadi ini hanya kenyamanan tampilan.
import { createContext, useContext } from "react";
import { usePathname } from "next/navigation";
import { Eye } from "lucide-react";
import { canEditMenu, hasMenu, MENUS, type MenuKey } from "@/lib/roles";
import { T } from "@/components/i18n";

type Access = { role: string; menuAccess: string[] };
const Ctx = createContext<Access | null>(null);

// Menu admin yang menguasai sebuah alamat halaman.
const PAGE_MENU: [string, MenuKey][] = [
  ["/portal/admin/karyawan", "karyawan"],
  ["/portal/admin/schedule", "absensi"],
  ["/portal/admin/jadwal", "absensi"],
  ["/portal/admin/leave", "absensi"],
  ["/portal/admin/payroll", "gaji"],
  ["/portal/admin/pinjaman", "pinjaman"],
  ["/portal/admin/onboarding", "prakaryawan"],
  ["/portal/admin/workflow", "workflow"],
  ["/portal/admin/perusahaan", "perusahaan"],
  ["/portal/admin/settings", "pengaturan"],
];
export const pageMenu = (path: string) => PAGE_MENU.find(([p]) => path === p || path.startsWith(p + "/"))?.[1] ?? null;

export function EditAccessProvider({ access, children }: { access: Access; children: React.ReactNode }) {
  return <Ctx.Provider value={access}>{children}</Ctx.Provider>;
}

export function useCanEdit(menu?: MenuKey) {
  const access = useContext(Ctx);
  const path = usePathname();
  const key = menu ?? pageMenu(path);
  if (!key) return true; // bukan halaman menu admin
  return canEditMenu(access, key);
}

// Pita "Mode lihat saja" di atas halaman admin yang hanya boleh dilihat.
export function ViewOnlyBanner({ access }: { access: Access }) {
  const path = usePathname();
  const key = pageMenu(path);
  if (!key || !hasMenu(access, key) || canEditMenu(access, key)) return null;
  const levels = MENUS.find((m) => m.key === key)?.levels as readonly string[] | undefined;
  if (levels && !levels.includes("edit")) return null; // menu memang hanya untuk dilihat (Company)
  return (
    <div className="print:hidden flex items-center gap-2 bg-sky-50 px-4 py-2 text-xs font-medium text-sky-800 sm:px-6">
      <Eye size={14} /> <T>Mode lihat saja: Anda bisa melihat data di menu ini, tetapi tidak bisa mengubahnya.</T>
    </div>
  );
}
