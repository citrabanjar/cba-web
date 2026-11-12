export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAccess } from "@/lib/access";
import { isSuperAdmin } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { getWorkflow } from "@/lib/workflow-settings";
import WorkflowClient from "./WorkflowClient";

export const metadata: Metadata = { title: "Workflow" };

// Workflow approval per modul (Super Admin): Level 1..3 menggantikan atasan langsung.
export default async function WorkflowPage() {
  const access = await getAccess();
  if (!access) redirect("/portal");
  if (!isSuperAdmin(access.role)) redirect("/portal/dashboard");
  const [settings, users] = await Promise.all([
    getWorkflow(),
    prisma.user.findMany({
      where: { isActive: true }, orderBy: { name: "asc" },
      select: { id: true, name: true, position: true, department: { select: { name: true } } },
    }),
  ]);
  return <WorkflowClient settings={settings} users={users.map((u) => ({ id: u.id, name: u.name, info: [u.position, u.department?.name].filter(Boolean).join(" · ") }))} />;
}
