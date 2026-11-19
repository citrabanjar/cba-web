export const dynamic = "force-dynamic";
import { notFound, redirect } from "next/navigation";
import { getAccess } from "@/lib/access";
import { hasMenu, isSuperAdmin } from "@/lib/roles";
import { loadEmployeeDetail } from "@/lib/employee-detail";
import KaryawanDetailClient from "./KaryawanDetailClient";

// Data Karyawan → profil karyawan (Admin). Data dimuat bersama Profil Saya (lib/employee-detail) supaya tampilannya sama.
export default async function KaryawanDetailPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aksi?: string; tab?: string; tanggal?: string }>;
}) {
  const access = await getAccess();
  if (!access) redirect("/portal");
  if (!hasMenu(access, "karyawan")) redirect("/portal/dashboard");

  const { id } = await params;
  const data = await loadEmployeeDetail(id, {
    canSeePay: hasMenu(access, "gaji"),
    // Tab Pinjaman hanya untuk Admin dan Super Admin.
    canSeeLoans: hasMenu(access, "pinjaman"),
    isSuper: isSuperAdmin(access.role),
  });
  if (!data) notFound();
  const sp = await searchParams;

  return (
    <KaryawanDetailClient
      {...data}
      initialAction={sp.aksi}
      initialTab={sp.tab}
      initialDate={sp.tanggal}
      canEdit={isSuperAdmin(access.role) || data.employee.role === "KARYAWAN"}
    />
  );
}
