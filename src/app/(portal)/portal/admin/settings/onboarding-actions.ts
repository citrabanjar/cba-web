"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isSuperAdmin } from "@/lib/roles";
import { normalizeOnboardingSettings, ONBOARDING_SETTING_KEY, type OnboardingSettings } from "@/lib/onboarding-interview";

// Setup Onboarding (Super Admin): tahap wawancara aktif/tidak, model approval, dan daftar approver.
export async function saveOnboardingSettings(input: OnboardingSettings): Promise<{ error?: string }> {
  const session = await auth();
  if (!session?.user || !isSuperAdmin(session.user.role)) return { error: "Hanya Super Admin yang bisa mengubah setup onboarding." };
  const v = normalizeOnboardingSettings(input);
  // Nama approver diambil ulang dari database; hanya karyawan aktif.
  const users = await prisma.user.findMany({ where: { id: { in: v.approvers.map((a) => a.id) }, isActive: true }, select: { id: true, name: true } });
  v.approvers = v.approvers.filter((a) => users.some((u) => u.id === a.id)).map((a) => ({ id: a.id, name: users.find((u) => u.id === a.id)!.name }));
  if (v.enabled && v.approvers.length === 0) return { error: "Pilih minimal satu approver di workflow approval." };
  if (v.enabled && v.mode === "SIRKULAR" && v.approvers.length < 2) return { error: "Approval sirkular butuh minimal dua approver." };
  if (v.mode === "TUNGGAL") v.approvers = v.approvers.slice(0, 1);
  await prisma.appSetting.upsert({
    where: { key: ONBOARDING_SETTING_KEY },
    update: { value: v, updatedBy: session.user.name ?? null }, create: { key: ONBOARDING_SETTING_KEY, value: v, updatedBy: session.user.name ?? null },
  });
  revalidatePath("/portal/admin/settings");
  revalidatePath("/portal/admin/onboarding");
  revalidatePath("/portal", "layout");
  return {};
}
