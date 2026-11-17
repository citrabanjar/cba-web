"use server";

import { revalidatePath } from "next/cache";
import { getAccess } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { workflowFeatureOn } from "@/lib/workflow-settings";
import { normalizeWorkflow, ROLE_GROUP_PREFIX, WORKFLOW_KEY, WORKFLOW_MODULES, type WorkflowSettings } from "@/lib/workflow";
import { getAdminRoles } from "@/lib/admin-roles";
import { canEditMenu, menuLevelOf } from "@/lib/roles";

// Super Admin menyimpan Level approval per modul (bila fitur Workflow dinyalakan).
export async function saveWorkflow(input: WorkflowSettings): Promise<{ error?: string }> {
  const access = await getAccess();
  if (!access || access.role !== "SUPER_ADMIN") return { error: "Hanya Super Admin yang bisa mengubah workflow." };
  if (!(await workflowFeatureOn())) return { error: "Fitur Workflow belum dinyalakan di Pengaturan → Fitur." };
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
      }
    }
    if (mod.enabled && mod.levels.length === 0) return { error: `Workflow ${m.label} aktif tapi Level 1 belum diisi.` };
    // Pinjaman: tepat satu level Pemeriksa dokumen, tepat sebelum level terakhir (pemutus), dan pemeriksanya punya hak Edit Pinjaman.
    if (m.key === "PINJAMAN" && mod.enabled) {
      const ci = mod.levels.findIndex((l) => l.check);
      if (mod.levels.length < 2 || ci !== mod.levels.length - 2) {
        return { error: "Workflow Pinjaman: tandai satu level sebagai Pemeriksa dokumen, tepat sebelum level terakhir (pemutus pinjaman)." };
      }
      const l = mod.levels[ci];
      const groups = await getAdminRoles();
      const ok = l.type === "EMPLOYEE"
        ? canEditMenu(await prisma.user.findUnique({ where: { id: l.value }, select: { role: true, menuAccess: true } }), "pinjaman")
        : l.value.startsWith(ROLE_GROUP_PREFIX) ? menuLevelOf(groups.find((g) => `${ROLE_GROUP_PREFIX}${g.id}` === l.value)?.menus ?? [], "pinjaman") === "edit"
        : true;
      if (!ok) return { error: "Workflow Pinjaman: Pemeriksa dokumen harus punya hak Edit menu Pinjaman Karyawan (untuk memeriksa dan menyusun angsuran)." };
    }
  }
  await prisma.appSetting.upsert({
    where: { key: WORKFLOW_KEY },
    update: { value: v, updatedBy: access.name ?? null }, create: { key: WORKFLOW_KEY, value: v, updatedBy: access.name ?? null },
  });
  revalidatePath("/portal", "layout");
  return {};
}
