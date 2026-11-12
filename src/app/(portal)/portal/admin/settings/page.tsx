export const dynamic = "force-dynamic";

import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { isManagement, isSuperAdmin } from "@/lib/roles";
import { getHiddenIndicators } from "@/lib/app-settings";
import { getAgentSettings } from "../../dashboard/agent";
import { prisma } from "@/lib/prisma";
import { getAiSettings, hasApiKey } from "@/lib/ai-checker";
import { getOnboardingSettings } from "@/lib/onboarding-settings";
import { workflowFeatureOn } from "@/lib/workflow-settings";
import SettingsClient from "./SettingsClient";

export default async function AdminSettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/portal");
  if (!isManagement(session.user.role)) redirect("/portal/dashboard");

  const hidden = isSuperAdmin(session.user.role) ? await getHiddenIndicators() : null;
  const agent = isSuperAdmin(session.user.role) ? await getAgentSettings() : null;
  const ai = isSuperAdmin(session.user.role) ? await loadAi() : null;
  const onboarding = isSuperAdmin(session.user.role) ? await loadOnboarding() : null;

  return (
    <SettingsClient
      indicatorHidden={hidden}
      agentSettings={agent}
      ai={ai}
      onboarding={onboarding}
      name={session.user.name ?? ""}
      employeeId={session.user.employeeId ?? session.user.email ?? ""}
      role={session.user.role}
    />
  );
}

// Data tab AI Pemeriksa (Super Admin).
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
  const [settings, workflow] = await Promise.all([getOnboardingSettings(), workflowFeatureOn()]);
  return { settings, workflow };
}
