export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { T } from "@/components/i18n";
import { isSuperAdmin } from "@/lib/roles";
import { checkList } from "@/lib/overtime-check";
import CekFisikClient from "./CekFisikClient";

export const metadata: Metadata = { title: "Cek Fisik Lembur" };

// Security: daftar karyawan lembur yang perlu dicek keberadaannya selama jam lembur.
export default async function CekFisikPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/portal");
  if (isSuperAdmin(session.user.role)) redirect("/portal/dashboard");
  const items = await checkList(session.user.id);
  return (
    <div className="min-h-full bg-gray-50">
      <div className="border-b border-gray-100 bg-white px-6 py-4">
        <h2 className="font-bold text-gray-800"><T>Cek Fisik Lembur</T></h2>
        <p className="mt-0.5 text-xs text-gray-400"><T>Pastikan karyawan yang lembur benar-benar ada di tempat kerja. Cek bisa dilakukan berkali-kali selama jam lembur.</T></p>
      </div>
      <CekFisikClient items={items} />
    </div>
  );
}
