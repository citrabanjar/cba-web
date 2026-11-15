import { redirect } from "next/navigation";

// Persetujuan kini menjadi modul di halaman Notifikasi (lonceng); tautan lama diarahkan ke sana.
export default function PersetujuanPage() {
  redirect("/portal/notifikasi?modul=persetujuan");
}
