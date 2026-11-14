export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAccess } from "@/lib/access";
import { isSuperAdmin } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { getWorkflowRaw, workflowFeatureOn } from "@/lib/workflow-settings";
import { getAdminRoles } from "@/lib/admin-roles";
import WorkflowClient from "./WorkflowClient";

export const metadata: Metadata = { title: "Workflow" };

// Workflow approval per modul (Super Admin): Level 1..3 menggantikan atasan langsung. Fitur dinyalakan di Pengaturan → Fitur.
export default async function WorkflowPage() {
  const access = await getAccess();
  if (!access) redirect("/portal");
  // Workflow diatur Super Admin.
  if (!isSuperAdmin(access.role)) redirect("/portal/dashboard");
  if (!(await workflowFeatureOn())) redirect("/portal/dashboard");
  const [settings, users, roles] = await Promise.all([
    getWorkflowRaw(),
    prisma.user.findMany({
      where: { isActive: true }, orderBy: [{ employeeId: "asc" }, { name: "asc" }],
      select: { id: true, name: true, employeeId: true },
    }),
    getAdminRoles(),
  ]);
  return (
    <WorkflowClient settings={settings} groups={roles.map((r) => ({ id: r.id, name: r.name }))}
      users={users.map((u) => ({ id: u.id, name: u.name, employeeId: u.employeeId ?? "" }))} />
  );
}
