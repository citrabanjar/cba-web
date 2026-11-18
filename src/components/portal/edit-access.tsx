"use client";

// Hak lihat / edit per menu admin untuk komponen di browser.
// Pemakaian di halaman admin:  const canEdit = useCanEdit();          // menu halaman ini (dari alamat)
//                              const canEditPay = useCanEdit("gaji");  // menu tertentu
// Tombol yang mengubah data (Tambah, Simpan, Hapus, Upload, Proses, Setujui/Tolak, dll.) disembunyikan bila canEdit = false.
// Server tetap menolak aksi ubah dari pemegang hak lihat (requireMenu / canEditMenu), jadi ini hanya kenyamanan tampilan.
import { createContext, useContext } from "react";
import { usePathname } from "next/navigation";
import { canEditMenu, canProposeMenu, hasMenu, type MenuKey } from "@/lib/roles";
import { pageMenu } from "@/lib/page-menu";
export { pageMenu };

type Access = { role: string; menuAccess: string[] };
const Ctx = createContext<Access | null>(null);


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

// Hak menempel parameter ke karyawan (pola kerja, jadwal bulanan, komponen gaji): cukup hak lihat.
export function useCanApply(menu?: MenuKey) {
  const access = useContext(Ctx);
  const path = usePathname();
  const key = menu ?? pageMenu(path);
  if (!key) return true;
  return hasMenu(access, key);
}

// Hak "Ajukan": boleh mengisi perubahan, tetapi baru berlaku setelah disetujui atasan langsung.
export function useCanPropose(menu: MenuKey) {
  const access = useContext(Ctx);
  return canProposeMenu(access, menu);
}
