export const dynamic = "force-dynamic";
import { redirect } from "next/navigation";
import { getAccess } from "@/lib/access";
import { isSuperAdmin } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import SetupClient from "./SetupClient";

export default async function SetupPage() {
  const access = await getAccess();
  if (!access) redirect("/portal");
  if (!isSuperAdmin(access.role)) redirect("/portal/dashboard");

  const orderBy = { name: "asc" } as const;
  const [branches, departments, positions, byBranch, byPosition] = await Promise.all([
    prisma.branch.findMany({ orderBy, select: { id: true, name: true } }),
    prisma.department.findMany({ orderBy, select: { id: true, name: true, _count: { select: { users: true } } } }),
    prisma.position.findMany({ orderBy, select: { id: true, name: true } }),
    prisma.user.groupBy({ by: ["branch"], _count: { _all: true } }),
    prisma.user.groupBy({ by: ["position"], _count: { _all: true } }),
  ]);

  const usage = new Map(byBranch.map((r) => [r.branch, r._count._all]));
  const positionUsage = new Map(byPosition.map((r) => [r.position, r._count._all]));

  return (
    <SetupClient
      branches={branches.map((b) => ({ ...b, used: usage.get(b.name) ?? 0 }))}
      departments={departments.map((d) => ({ id: d.id, name: d.name, used: d._count.users }))}
      positions={positions.map((p) => ({ ...p, used: positionUsage.get(p.name) ?? 0 }))}
    />
  );
}
