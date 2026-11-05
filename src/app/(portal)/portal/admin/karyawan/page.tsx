export const dynamic = "force-dynamic";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import KaryawanClient from "./KaryawanClient";

export default async function AdminKaryawanPage() {
  const session = await auth();
  if (!session?.user) redirect("/portal");

  const employees = await prisma.user.findMany({
    include: { department: true },
    orderBy: { employeeId: "asc" },
  });

  const depts = await prisma.department.findMany({ orderBy: { name: "asc" } });

  return <KaryawanClient employees={employees} depts={depts} />;
}
