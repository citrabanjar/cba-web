import { prisma } from "@/lib/prisma";
import { actionableApprovers, normalizeOnboardingSettings, ONBOARDING_SETTING_KEY, readInterview, type OnboardingSettings } from "@/lib/onboarding-interview";

// Setup Onboarding dari Super Admin (Pengaturan → Onboarding).
export async function getOnboardingSettings(): Promise<OnboardingSettings> {
  const row = await prisma.appSetting.findUnique({ where: { key: ONBOARDING_SETTING_KEY } });
  return normalizeOnboardingSettings(row?.value);
}

// Approval wawancara yang menunggu keputusan user ini (badge menu Persetujuan).
export async function pendingInterviewApprovals(userId: string) {
  const list = await prisma.candidate.findMany({ where: { status: "APPROVAL_WAWANCARA" }, select: { interview: true } });
  return list.filter((c) => actionableApprovers(readInterview(c.interview)?.approval ?? null).includes(userId)).length;
}

// User ini approver wawancara (di setup) atau masih tercatat di approval yang berjalan.
export async function isInterviewApprover(userId: string) {
  const s = await getOnboardingSettings();
  if (s.enabled && s.interview && s.approvers.some((a) => a.id === userId)) return true;
  return (await pendingInterviewApprovals(userId)) > 0;
}
