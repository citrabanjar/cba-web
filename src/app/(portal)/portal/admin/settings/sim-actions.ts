"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isSuperAdmin } from "@/lib/roles";
import { assessRecent } from "@/lib/attendance-assess";
import { SIM_SETTING_KEY, deleteSimulated, simulateRecent } from "@/lib/attendance-sim";

// Absen uji (masa testing), khusus Super Admin.
async function requireSuper() {
  const session = await auth();
  if (!session?.user || !isSuperAdmin(session.user.role)) throw new Error("Hanya Super Admin.");
  return session.user;
}

export async function setSimEnabled(enabled: boolean): Promise<{ error?: string }> {
  const user = await requireSuper();
  await prisma.appSetting.upsert({
    where: { key: SIM_SETTING_KEY },
    update: { value: { enabled }, updatedBy: user.name ?? null },
    create: { key: SIM_SETTING_KEY, value: { enabled }, updatedBy: user.name ?? null },
  });
  revalidatePath("/portal/admin/settings");
  return {};
}

// Isi absen uji untuk N hari terakhir (sampai kemarin), lalu nilai ulang kehadiran (alpha otomatis).
export async function runSimNow(days: number): Promise<{ error?: string; created?: number }> {
  await requireSuper();
  const r = await simulateRecent(days);
  await assessRecent(true).catch(() => null);
  revalidatePath("/portal", "layout");
  return { created: r.created };
}

export async function clearSim(): Promise<{ error?: string; deleted?: number }> {
  await requireSuper();
  const deleted = await deleteSimulated();
  await assessRecent(true).catch(() => null);
  revalidatePath("/portal", "layout");
  return { deleted };
}
