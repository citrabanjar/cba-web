import { prisma } from "@/lib/prisma";
import {
  actionableApprovers, APPROVAL_STATUSES, normalizeOnboardingSettings, ONBOARDING_SETTING_KEY, pendingReviews, readInterview,
  type OnboardingSettings,
} from "@/lib/onboarding-interview";

// Saklar modul Pra-Karyawan dari Super Admin (Pengaturan → Fitur).
export async function getOnboardingSettings(): Promise<OnboardingSettings> {
  const row = await prisma.appSetting.findUnique({ where: { key: ONBOARDING_SETTING_KEY } });
  return normalizeOnboardingSettings(row?.value);
}

// Tugas Pra-Karyawan yang menunggu user ini (badge menu Persetujuan): penilaian wawancara + keputusan approval.
export async function pendingInterviewApprovals(userId: string) {
  const list = await prisma.candidate.findMany({ where: { status: { in: [...APPROVAL_STATUSES, "WAWANCARA"] } }, select: { status: true, interview: true } });
  return list.filter((c) => {
    const i = readInterview(c.interview);
    if (c.status === "WAWANCARA") return pendingReviews(i).some((r) => r.id === userId);
    return actionableApprovers(i?.approval ?? null).includes(userId);
  }).length;
}

// User ini punya tugas Pra-Karyawan (penilaian wawancara / keputusan approval) yang sedang berjalan.
export async function isInterviewApprover(userId: string) {
  return (await pendingInterviewApprovals(userId)) > 0;
}
