export const dynamic = "force-dynamic";
import { redirect } from "next/navigation";
import { getAccess } from "@/lib/access";
import { hasMenu } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import KaryawanClient from "./KaryawanClient";

export default async function AdminKaryawanPage() {
  const access = await getAccess();
  if (!access) redirect("/portal");
  if (!hasMenu(access, "karyawan")) redirect("/portal/dashboard");

  const employees = await prisma.user.findMany({
    where: { role: { not: "SUPER_ADMIN" } },
    // Pakai select eksplisit supaya passwordHash tidak ikut terkirim ke client.
    select: {
      id: true,
      employeeNo: true,
      employeeId: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      employmentStatus: true,
      position: true,
      isActive: true,
      joinDate: true,
      bankName: true,
      bankAccount: true,
      bankHolder: true,
      department: { select: { id: true, name: true } },
    },
    orderBy: [{ employeeNo: "asc" }, { employeeId: "asc" }],
  });

  const depts = await prisma.department.findMany({ orderBy: { name: "asc" } });

  return (
    <KaryawanClient
      employees={employees.map((e) => ({ ...e, employeeId: e.employeeId ?? "" }))}
      depts={depts}
      canImport={hasMenu(access, "import")}
    />
  );
}
