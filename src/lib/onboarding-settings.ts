import { prisma } from "@/lib/prisma";
import {
  actionableApprovers, APPROVAL_STATUSES, normalizeOnboardingFlow, normalizeOnboardingSettings, ONBOARDING_FLOW_KEY,
  ONBOARDING_SETTING_KEY, pendingReviews, readInterview, type OnboardingFlow, type OnboardingSettings,
} from "@/lib/onboarding-interview";

// Saklar modul Pra-Karyawan dari Super Admin (Pengaturan → Fitur).
export async function getOnboardingSettings(): Promise<OnboardingSettings> {
  const row = await prisma.appSetting.findUnique({ where: { key: ONBOARDING_SETTING_KEY } });
  return normalizeOnboardingSettings(row?.value);
}

// Alur Pra-Karyawan dari Admin (menu Pra-Karyawan → Alur). Belum diatur: ikut pilihan wawancara lama dari Super Admin.
export async function getOnboardingFlow(): Promise<OnboardingFlow> {
  const [flow, old] = await Promise.all([
    prisma.appSetting.findUnique({ where: { key: ONBOARDING_FLOW_KEY } }),
    prisma.appSetting.findUnique({ where: { key: ONBOARDING_SETTING_KEY } }),
  ]);
  return normalizeOnboardingFlow(flow?.value, normalizeOnboardingSettings(old?.value).interview);
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

// User ini pewawancara / approver di setup alur, atau masih punya tugas Pra-Karyawan yang berjalan.
export async function isInterviewApprover(userId: string) {
  const [s, f] = await Promise.all([getOnboardingSettings(), getOnboardingFlow()]);
  if (s.enabled && [...f.interviewers, ...f.approvers].some((x) => x.id === userId)) return true;
  return (await pendingInterviewApprovals(userId)) > 0;
}
