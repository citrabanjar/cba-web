export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAccess } from "@/lib/access";
import { hasMenu, isSuperAdmin } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { getMasterOptions } from "@/lib/master-data";
import { mailerReady } from "@/lib/mailer";
import { readData, readJob } from "@/lib/onboarding";
import { actionableApprovers, readInterview } from "@/lib/onboarding-interview";
import { getOnboardingSettings } from "@/lib/onboarding-settings";
import OnboardingClient, { type CandidateRow } from "./OnboardingClient";

export const metadata: Metadata = { title: "Pra-Karyawan" };

// Onboarding calon karyawan: undang, periksa data, ajukan, setujui.
export default async function OnboardingPage() {
  const access = await getAccess();
  if (!access) redirect("/portal");
  if (!hasMenu(access, "karyawan")) redirect("/portal/dashboard");

  const [candidates, master, settings] = await Promise.all([
    prisma.candidate.findMany({ orderBy: { createdAt: "desc" } }),
    getMasterOptions(),
    getOnboardingSettings(),
  ]);
  const now = new Date();
  const rows: CandidateRow[] = candidates.map((c) => ({
    id: c.id, name: c.name, email: c.email, phone: c.phone, status: c.status, note: c.note,
    data: readData(c.data, c.name, c.phone), job: readJob(c.job),
    // Selama email belum tersambung, kode OTP yang masih berlaku ditampilkan ke HRD untuk diteruskan.
    otp: !mailerReady() && c.otpCode && c.otpExpires && c.otpExpires > now ? { code: c.otpCode, until: c.otpExpires.toISOString() } : null,
    submittedAt: c.submittedAt?.toISOString() ?? null, createdAt: c.createdAt.toISOString(),
    invitedBy: c.invitedBy, reviewedBy: c.reviewedBy, approvedBy: c.approvedBy, approvedAt: c.approvedAt?.toISOString() ?? null, userId: c.userId,
    interview: readInterview(c.interview),
    canDecide: c.status === "APPROVAL_WAWANCARA" && actionableApprovers(readInterview(c.interview)?.approval ?? null).includes(access.id),
  }));
  return <OnboardingClient rows={rows} master={master} canApprove={isSuperAdmin(access.role)} interviewOn={settings.interview} />;
}
