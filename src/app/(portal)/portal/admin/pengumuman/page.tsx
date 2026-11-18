export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAccess } from "@/lib/access";
import { hasMenu } from "@/lib/roles";
import { allAnnouncements } from "@/lib/announcement";
import PengumumanClient from "./PengumumanClient";

export const metadata: Metadata = { title: "Pengumuman" };

// Panel Admin → Pengumuman: pengumuman perusahaan yang tampil di Beranda semua karyawan.
export default async function PengumumanPage() {
  const access = await getAccess();
  if (!access) redirect("/portal");
  if (!hasMenu(access, "pengaturan")) redirect("/portal/dashboard");
  return <PengumumanClient rows={await allAnnouncements()} />;
}
