export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAccess } from "@/lib/access";
import { hasMenu, isSuperAdmin } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { T } from "@/components/i18n";
import { toLoanView } from "@/lib/loan-view";
import PinjamanAdminClient from "./PinjamanAdminClient";

export const metadata: Metadata = { title: "Pinjaman Karyawan" };

// Daftar semua pinjaman karyawan (Admin & Super Admin) dan upload saldo awal migrasi (Super Admin).
export default async function PinjamanAdminPage() {
  const access = await getAccess();
  if (!access) redirect("/portal");
  if (!hasMenu(access, "pinjaman")) redirect("/portal/dashboard");
  const [loans, employees] = await Promise.all([
    prisma.employeeLoan.findMany({
      orderBy: [{ createdAt: "desc" }],
      include: { installments: true, user: { select: { name: true, employeeId: true, department: { select: { name: true } } } } },
    }),
    prisma.user.findMany({
      where: { role: { not: "SUPER_ADMIN" }, employeeId: { not: null } }, orderBy: { name: "asc" },
      select: { name: true, employeeId: true },
    }),
  ]);
  return (
    <div className="bg-gray-50 min-h-full">
      <div className="bg-white border-b border-gray-100 px-6 py-4">
        <h2 className="font-bold text-gray-800"><T>Pinjaman Karyawan</T></h2>
        <p className="text-xs text-gray-400 mt-0.5"><T>Semua pinjaman karyawan. Proses pengajuan, pencairan, dan perubahan angsuran dilakukan di tab Pinjaman profil karyawan.</T></p>
      </div>
      <PinjamanAdminClient
        isSuper={isSuperAdmin(access.role)}
        loans={loans.map((l) => ({ ...toLoanView(l), userId: l.userId, name: l.user.name, employeeId: l.user.employeeId ?? "", department: l.user.department?.name ?? null }))}
        employees={employees.map((e) => ({ name: e.name, employeeId: e.employeeId ?? "" }))}
      />
    </div>
  );
}
