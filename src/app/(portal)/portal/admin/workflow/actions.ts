"use server";

import { revalidatePath } from "next/cache";
import { getAccess } from "@/lib/access";
import { isManagement, isSuperAdmin } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { normalizeWorkflow, WORKFLOW_KEY, WORKFLOW_MODULES, type WorkflowSettings } from "@/lib/workflow";

// Admin menyimpan Level approval per modul.
export async function saveWorkflow(input: WorkflowSettings): Promise<{ error?: string }> {
  const access = await getAccess();
  if (!access || !isManagement(access.role) || isSuperAdmin(access.role)) return { error: "Hanya Admin yang bisa mengubah workflow." };
  const v = normalizeWorkflow(input);
  const empIds = Object.values(v).flatMap((m) => m.levels.filter((l) => l.type === "EMPLOYEE").map((l) => l.value));
  const users = await prisma.user.findMany({ where: { id: { in: empIds }, isActive: true }, select: { id: true, name: true } });
  for (const m of WORKFLOW_MODULES) {
    const mod = v[m.key];
    for (const [i, l] of mod.levels.entries()) {
      if (l.type === "EMPLOYEE") {
        const u = users.find((x) => x.id === l.value);
        if (!u) return { error: `Workflow ${m.label} Level ${i + 1}: karyawan tidak aktif / tidak ditemukan.` };
        l.label = u.name;
      } else if (l.type === "POSITION" && m.key === "PRA_KARYAWAN") {
        return { error: `Workflow ${m.label} Level ${i + 1}: calon karyawan belum punya atasan, pilih hak akses atau karyawan tertentu.` };
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
