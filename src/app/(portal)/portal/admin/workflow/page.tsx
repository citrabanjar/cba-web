export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAccess } from "@/lib/access";
import { isManagement, isSuperAdmin } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { getWorkflowRaw, workflowFeatureOn } from "@/lib/workflow-settings";
import WorkflowClient from "./WorkflowClient";

export const metadata: Metadata = { title: "Workflow" };

// Workflow approval per modul (Admin): Level 1..3 menggantikan atasan langsung. Fitur dinyalakan Super Admin di Pengaturan → Fitur.
export default async function WorkflowPage() {
  const access = await getAccess();
  if (!access) redirect("/portal");
  // Super Admin hanya menyalakan fitur di Pengaturan → Fitur; Level diatur Admin.
  if (isSuperAdmin(access.role)) redirect("/portal/admin/settings");
  if (!isManagement(access.role)) redirect("/portal/dashboard");
  if (!(await workflowFeatureOn())) redirect("/portal/dashboard");
  const [settings, users] = await Promise.all([
    getWorkflowRaw(),
    prisma.user.findMany({
      where: { isActive: true }, orderBy: [{ employeeId: "asc" }, { name: "asc" }],
      select: { id: true, name: true, employeeId: true },
    }),
  ]);
  return (
    <WorkflowClient settings={settings}
      users={users.map((u) => ({ id: u.id, name: u.name, employeeId: u.employeeId ?? "" }))} />
  );
}
