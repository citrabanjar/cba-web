export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAccess } from "@/lib/access";
import { hasMenu, isSuperAdmin } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { getMasterOptions } from "@/lib/master-data";
import { mailerReady } from "@/lib/mailer";
import { readData, readJob } from "@/lib/onboarding";
import { actionableApprovers, APPROVAL_STATUSES, readInterview } from "@/lib/onboarding-interview";
import { getOnboardingSettings } from "@/lib/onboarding-settings";
import OnboardingClient, { type CandidateRow } from "./OnboardingClient";

export const metadata: Metadata = { title: "Pra-Karyawan" };

// Onboarding calon karyawan: undang, periksa data, ajukan, setujui.
export default async function OnboardingPage() {
  const access = await getAccess();
  if (!access) redirect("/portal");
  if (!hasMenu(access, "prakaryawan")) redirect("/portal/dashboard");
  // Modul dimatikan Super Admin di Pengaturan → Pra-Karyawan.
  if (!(await getOnboardingSettings()).enabled) redirect(isSuperAdmin(access.role) ? "/portal/admin/settings" : "/portal/dashboard");

  const [candidates, master, people] = await Promise.all([
    prisma.candidate.findMany({ orderBy: { createdAt: "desc" } }),
    getMasterOptions(),
    // Pilihan calon atasan langsung: karyawan aktif, "Employee ID - Nama".
    prisma.user.findMany({ where: { isActive: true, employeeId: { not: null } }, orderBy: { employeeId: "asc" }, select: { id: true, name: true, employeeId: true } }),
  ]);
  const managers = people.map((u) => ({ value: u.id, label: `${u.employeeId} - ${u.name}` }));
  const now = new Date();
  const rows: CandidateRow[] = candidates.map((c) => ({
    id: c.id, name: c.name, email: c.email, phone: c.phone, status: c.status, note: c.note,
    data: readData(c.data, c.name, c.phone), job: readJob(c.job),
    // Selama email belum tersambung, kode OTP yang masih berlaku ditampilkan ke HRD untuk diteruskan.
    otp: !mailerReady() && c.otpCode && c.otpExpires && c.otpExpires > now ? { code: c.otpCode, until: c.otpExpires.toISOString() } : null,
    submittedAt: c.submittedAt?.toISOString() ?? null, createdAt: c.createdAt.toISOString(),
    invitedBy: c.invitedBy, reviewedBy: c.reviewedBy, approvedBy: c.approvedBy, approvedAt: c.approvedAt?.toISOString() ?? null, userId: c.userId,
    interview: readInterview(c.interview),
    canDecide: APPROVAL_STATUSES.includes(c.status) && actionableApprovers(readInterview(c.interview)?.approval ?? null).includes(access.id),
  }));
  return (
    <OnboardingClient rows={rows} master={{ ...master, managers }} canApprove={isSuperAdmin(access.role)}
      people={people.map((u) => ({ id: u.id, employeeId: u.employeeId ?? "", name: u.name }))} />
  );
}
