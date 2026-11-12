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
  // Approver diatur di menu Workflow → Pra-Karyawan.
  v.approvers = [];
  await prisma.appSetting.upsert({
    where: { key: ONBOARDING_SETTING_KEY },
    update: { value: v, updatedBy: session.user.name ?? null }, create: { key: ONBOARDING_SETTING_KEY, value: v, updatedBy: session.user.name ?? null },
  });
  revalidatePath("/portal/admin/settings");
  revalidatePath("/portal/admin/onboarding");
  revalidatePath("/portal", "layout");
  return {};
}
