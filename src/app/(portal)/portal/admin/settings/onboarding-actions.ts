"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isSuperAdmin } from "@/lib/roles";
import { normalizeOnboardingSettings, ONBOARDING_SETTING_KEY, type OnboardingSettings } from "@/lib/onboarding-interview";
import { WORKFLOW_FEATURE_KEY } from "@/lib/workflow";

// Pengaturan → Fitur (Super Admin): fitur mana yang dipakai perusahaan.
export async function saveFeatures(input: { workflow: boolean; onboarding: OnboardingSettings }): Promise<{ error?: string }> {
  const session = await auth();
  if (!session?.user || !isSuperAdmin(session.user.role)) return { error: "Hanya Super Admin yang bisa mengubah fitur." };
  const v = normalizeOnboardingSettings(input.onboarding);
  // Approver Pra-Karyawan diatur di menu Workflow → Pra-Karyawan, jadi Pra-Karyawan butuh fitur Workflow.
  if (v.enabled && !input.workflow) return { error: "Pra-Karyawan butuh fitur Workflow untuk menentukan approver. Aktifkan Workflow atau matikan Pra-Karyawan." };
  v.approvers = [];
  const by = session.user.name ?? null;
  await prisma.$transaction([
    prisma.appSetting.upsert({ where: { key: ONBOARDING_SETTING_KEY }, update: { value: v, updatedBy: by }, create: { key: ONBOARDING_SETTING_KEY, value: v, updatedBy: by } }),
    prisma.appSetting.upsert({ where: { key: WORKFLOW_FEATURE_KEY }, update: { value: { enabled: input.workflow }, updatedBy: by }, create: { key: WORKFLOW_FEATURE_KEY, value: { enabled: input.workflow }, updatedBy: by } }),
  ]);
  revalidatePath("/portal", "layout");
  return {};
}
