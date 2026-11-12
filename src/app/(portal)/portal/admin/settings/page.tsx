export const dynamic = "force-dynamic";

import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { hasMenu, isManagement, isSuperAdmin } from "@/lib/roles";
import { getAccess } from "@/lib/access";
import { getHiddenIndicators } from "@/lib/app-settings";
import { getAgentSettings } from "../../dashboard/agent";
import { prisma } from "@/lib/prisma";
import { aiFeatureOn, getAiSettings, hasApiKey } from "@/lib/ai-checker";
import { getOnboardingSettings } from "@/lib/onboarding-settings";
import { workflowFeatureOn } from "@/lib/workflow-settings";
import { getAdminRoles } from "@/lib/admin-roles";
import SettingsClient from "./SettingsClient";

export default async function AdminSettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/portal");
  const access = await getAccess();
  if (!access || !hasMenu(access, "pengaturan")) redirect("/portal/dashboard");

  // Super Admin: Akun + Fitur (menyiapkan perusahaan). Admin: setup detail Task Admin, Agent HRD, Running Indikator.
  const admin = isManagement(session.user.role) && !isSuperAdmin(session.user.role);
  const hidden = admin ? await getHiddenIndicators() : null;
  const agent = admin ? await getAgentSettings() : null;
  const ai = admin && (await aiFeatureOn()) ? await loadAi() : null;
  const onboarding = isSuperAdmin(session.user.role) ? await loadOnboarding() : null;
  const access2 = isSuperAdmin(session.user.role) ? await loadAccess() : null;

  return (
    <SettingsClient
      indicatorHidden={hidden}
      agentSettings={agent}
      ai={ai}
      onboarding={onboarding}
      access={access2}
      name={session.user.name ?? ""}
      employeeId={session.user.employeeId ?? session.user.email ?? ""}
      role={session.user.role}
    />
  );
}

// Data tab Peran Admin & Anggota Admin (Super Admin).
async function loadAccess() {
  const [roles, people] = await Promise.all([
    getAdminRoles(),
    prisma.user.findMany({
      where: { role: { not: "SUPER_ADMIN" }, isActive: true },
      select: { id: true, employeeId: true, name: true, position: true },
      orderBy: [{ employeeId: "asc" }, { name: "asc" }],
    }),
  ]);
  return { roles, people };
}

// Data tab Agent HRD (Admin).
async function loadAi() {
  const [settings, notes, runs] = await Promise.all([
    getAiSettings(),
    prisma.aiNote.findMany({ where: { status: { not: "DITOLAK" } }, orderBy: { createdAt: "asc" } }),
    prisma.aiRun.findMany({ orderBy: { createdAt: "desc" }, take: 15 }),
  ]);
  return {
    settings, hasKey: hasApiKey(), hasCron: Boolean(process.env.CRON_SECRET),
    notes: notes.map((n) => ({ id: n.id, kind: n.kind, title: n.title, content: n.content, status: n.status, source: n.source, createdBy: n.createdBy, approvedBy: n.approvedBy, createdAt: n.createdAt.toISOString() })),
    runs: runs.map((r) => ({
      id: r.id, status: r.status, trigger: r.trigger, createdAt: r.createdAt.toISOString(), finishedAt: r.finishedAt?.toISOString() ?? null, findingCount: r.findingCount,
      inputTokens: r.inputTokens, outputTokens: r.outputTokens, cacheReadTokens: r.cacheReadTokens, summary: r.summary, error: r.error,
    })),
  };
}

// Data tab Fitur (Super Admin).
async function loadOnboarding() {
  const [settings, workflow, agent, agentRules] = await Promise.all([getOnboardingSettings(), workflowFeatureOn(), aiFeatureOn(), getAgentSettings()]);
  return { settings, workflow, agent, setupDone: agentRules.setupDone };
}
