"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isSuperAdmin } from "@/lib/roles";
import { normalizeOnboardingSettings, ONBOARDING_SETTING_KEY, type OnboardingSettings } from "@/lib/onboarding-interview";
import { WORKFLOW_FEATURE_KEY } from "@/lib/workflow";
import { AI_FEATURE_KEY } from "@/lib/ai-checker-settings";

// Pengaturan → Fitur (Super Admin): fitur mana yang dipakai perusahaan.
export async function saveFeatures(input: { workflow: boolean; agent: boolean; onboarding: OnboardingSettings }): Promise<{ error?: string }> {
  const session = await auth();
  if (!session?.user || !isSuperAdmin(session.user.role)) return { error: "Hanya Super Admin yang bisa mengubah fitur." };
  const v = normalizeOnboardingSettings(input.onboarding);
  // Pewawancara & approver Pra-Karyawan diatur Admin di menu Pra-Karyawan → Alur (tidak butuh fitur Workflow).
  v.approvers = [];
  const by = session.user.name ?? null;
  await prisma.$transaction([
    prisma.appSetting.upsert({ where: { key: ONBOARDING_SETTING_KEY }, update: { value: v, updatedBy: by }, create: { key: ONBOARDING_SETTING_KEY, value: v, updatedBy: by } }),
    prisma.appSetting.upsert({ where: { key: WORKFLOW_FEATURE_KEY }, update: { value: { enabled: input.workflow }, updatedBy: by }, create: { key: WORKFLOW_FEATURE_KEY, value: { enabled: input.workflow }, updatedBy: by } }),
    prisma.appSetting.upsert({ where: { key: AI_FEATURE_KEY }, update: { value: { enabled: input.agent }, updatedBy: by }, create: { key: AI_FEATURE_KEY, value: { enabled: input.agent }, updatedBy: by } }),
  ]);
  revalidatePath("/portal", "layout");
  return {};
}
