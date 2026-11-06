export const dynamic = "force-dynamic";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import KaryawanClient from "./KaryawanClient";

export default async function AdminKaryawanPage() {
  const session = await auth();
  if (!session?.user) redirect("/portal");

  const employees = await prisma.user.findMany({
    // Pakai select eksplisit supaya passwordHash tidak ikut terkirim ke client.
    select: {
      id: true,
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
    orderBy: { employeeId: "asc" },
  });

  const depts = await prisma.department.findMany({ orderBy: { name: "asc" } });

  return <KaryawanClient employees={employees} depts={depts} />;
}
