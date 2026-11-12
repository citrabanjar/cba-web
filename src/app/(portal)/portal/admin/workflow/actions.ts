"use server";

import { revalidatePath } from "next/cache";
import { getAccess } from "@/lib/access";
import { isManagement } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { getMasterOptions } from "@/lib/master-data";
import { levelTitle, normalizeWorkflow, WORKFLOW_KEY, WORKFLOW_MODULES, type WorkflowSettings } from "@/lib/workflow";

// Admin menyimpan Level approval per modul.
export async function saveWorkflow(input: WorkflowSettings): Promise<{ error?: string }> {
  const access = await getAccess();
  if (!access || !isManagement(access.role)) return { error: "Hanya Admin yang bisa mengubah workflow." };
  const v = normalizeWorkflow(input);
  const empIds = Object.values(v).flatMap((m) => m.levels.filter((l) => l.type === "EMPLOYEE").map((l) => l.value));
  const [users, master] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: empIds }, isActive: true }, select: { id: true, name: true } }),
    getMasterOptions(),
  ]);
  for (const m of WORKFLOW_MODULES) {
    const mod = v[m.key];
    for (const [i, l] of mod.levels.entries()) {
      if (l.type === "EMPLOYEE") {
        const u = users.find((x) => x.id === l.value);
        if (!u) return { error: `Workflow ${m.label} Level ${i + 1}: karyawan tidak aktif / tidak ditemukan.` };
        l.label = u.name;
      } else if (l.type === "POSITION" && !master.positions.some((p) => p.trim().toLowerCase() === l.value.trim().toLowerCase())) {
        return { error: `Workflow ${m.label} Level ${i + 1}: ${levelTitle(l)} belum ada di Parameter Organisasi.` };
      }
    }
    if (mod.enabled && mod.levels.length === 0) return { error: `Workflow ${m.label} aktif tapi Level 1 belum diisi.` };
  }
  await prisma.appSetting.upsert({
    where: { key: WORKFLOW_KEY },
    update: { value: v, updatedBy: access.name ?? null }, create: { key: WORKFLOW_KEY, value: v, updatedBy: access.name ?? null },
  });
  revalidatePath("/portal", "layout");
  return {};
}
