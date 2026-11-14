import { redirect } from "next/navigation";

// Alamat lama; Struktur Organisasi kini menu semua karyawan.
export default function PerusahaanPage() {
  redirect("/portal/struktur");
}
