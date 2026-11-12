"use server";

import { revalidatePath } from "next/cache";
import { getAccess } from "@/lib/access";
import { isSuperAdmin } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { normalizeWorkflow, WORKFLOW_KEY, WORKFLOW_MODULES, type WorkflowSettings } from "@/lib/workflow";

export async function saveWorkflow(input: WorkflowSettings): Promise<{ error?: string }> {
  const access = await getAccess();
  if (!access || !isSuperAdmin(access.role)) return { error: "Hanya Super Admin yang bisa mengubah workflow." };
  const v = normalizeWorkflow(input);
  // Nama approver diambil ulang dari database; hanya karyawan aktif.
  const ids = Object.values(v).flatMap((m) => m.levels.map((l) => l.id));
  const users = await prisma.user.findMany({ where: { id: { in: ids }, isActive: true }, select: { id: true, name: true } });
  for (const m of WORKFLOW_MODULES) {
    const mod = v[m.key];
    mod.levels = mod.levels.filter((l) => users.some((u) => u.id === l.id)).map((l) => ({ id: l.id, name: users.find((u) => u.id === l.id)!.name }));
    if (mod.enabled && mod.levels.length === 0) return { error: `Workflow ${m.label} aktif tapi Level 1 belum dipilih.` };
  }
  await prisma.appSetting.upsert({
    where: { key: WORKFLOW_KEY },
    update: { value: v, updatedBy: access.name ?? null }, create: { key: WORKFLOW_KEY, value: v, updatedBy: access.name ?? null },
  });
  revalidatePath("/portal", "layout");
  return {};
}
