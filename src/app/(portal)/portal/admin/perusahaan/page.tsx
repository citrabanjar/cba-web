export const dynamic = "force-dynamic";
import { redirect } from "next/navigation";
import { getAccess } from "@/lib/access";
import { hasMenu } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import OrgChart from "./OrgChart";

export default async function PerusahaanPage() {
  const access = await getAccess();
  if (!access) redirect("/portal");
  if (!hasMenu(access, "perusahaan")) redirect("/portal/dashboard");

  // Struktur dibangun dari kolom Atasan, jadi selalu mengikuti data karyawan terbaru.
  const people = await prisma.user.findMany({
    where: { role: { not: "SUPER_ADMIN" }, isActive: true },
    select: {
      id: true, name: true, position: true, image: true, managerId: true,
      department: { select: { name: true } },
    },
    orderBy: [{ employeeNo: "asc" }, { name: "asc" }],
  });

  return (
    <OrgChart
      people={people.map((p) => ({
        id: p.id,
        name: p.name,
        position: p.position,
        image: p.image,
        managerId: p.managerId,
        department: p.department?.name ?? null,
      }))}
      canOpenProfile={hasMenu(access, "karyawan")}
    />
  );
}
