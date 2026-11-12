import { prisma } from "@/lib/prisma";
import { actionableApprovers, approvalComplete, type InterviewApproval } from "@/lib/onboarding-interview";
import { normalizeWorkflow, stepsFromLevels, WORKFLOW_KEY, type WorkflowKey, type WorkflowSettings } from "@/lib/workflow";

export async function getWorkflow(): Promise<WorkflowSettings> {
  const row = await prisma.appSetting.findUnique({ where: { key: WORKFLOW_KEY } });
  return normalizeWorkflow(row?.value);
}

// Jalur approval workflow untuk pengajuan baru; null = modul tidak aktif → aturan default (atasan langsung).
export async function workflowSteps(module: WorkflowKey, requesterId = ""): Promise<InterviewApproval | null> {
  const m = (await getWorkflow())[module];
  return m.enabled ? stepsFromLevels(m.levels, requesterId) : null;
}

// User ini approver di salah satu modul workflow yang aktif.
export async function isWorkflowApprover(userId: string) {
  const w = await getWorkflow();
  return Object.values(w).some((m) => m.enabled && m.levels.some((l) => l.id === userId));
}

// Keputusan satu level. Hasil: jejak baru, sudah selesai (semua setuju) atau ditolak.
export function decideStep(approval: InterviewApproval, userId: string, approve: boolean, note: string) {
  if (!actionableApprovers(approval).includes(userId)) return { error: "Belum giliran Anda memutus, atau Anda bukan penyetuju pengajuan ini." } as const;
  const step = approval.steps.find((s) => s.id === userId && !s.decision)!;
  step.decision = approve ? "SETUJU" : "TOLAK";
  step.at = new Date().toISOString();
  step.note = note.trim();
  return { approval, step, rejected: !approve, done: approve && approvalComplete(approval) } as const;
}
