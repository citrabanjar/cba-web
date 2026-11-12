import { prisma } from "@/lib/prisma";
import { actionableApprovers, approvalComplete, type InterviewApproval } from "@/lib/onboarding-interview";
import { normalizeWorkflow, readWorkflowFeature, stepsFromLevels, WORKFLOW_FEATURE_KEY, WORKFLOW_KEY, type WorkflowKey, type WorkflowSettings } from "@/lib/workflow";

export async function workflowFeatureOn() {
  const row = await prisma.appSetting.findUnique({ where: { key: WORKFLOW_FEATURE_KEY } });
  return readWorkflowFeature(row?.value);
}

// Isian menu Workflow apa adanya (untuk halaman Workflow).
export async function getWorkflowRaw(): Promise<WorkflowSettings> {
  const row = await prisma.appSetting.findUnique({ where: { key: WORKFLOW_KEY } });
  return normalizeWorkflow(row?.value);
}

// Workflow yang berlaku: bila fitur Workflow dimatikan, semua modul dianggap tidak aktif (kembali ke atasan langsung).
export async function getWorkflow(): Promise<WorkflowSettings> {
  const [w, on] = await Promise.all([getWorkflowRaw(), workflowFeatureOn()]);
  if (!on) for (const k of Object.keys(w) as WorkflowKey[]) w[k] = { ...w[k], enabled: false };
  return w;
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
