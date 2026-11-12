// Menu Workflow (Super Admin): approval custom per modul yang menggantikan (bypass) atasan langsung di profil karyawan.
// Modul aktif + Level 1..3 terisi → pengajuan semua karyawan untuk modul itu disetujui berurutan Level 1 → 2 → 3.
// Modul tidak aktif → aturan default (atasan langsung). Aman dipakai di server dan browser.
import type { ApprovalStep, ApproverRef, InterviewApproval } from "@/lib/onboarding-interview";

export const WORKFLOW_KEY = "workflow";
export const MAX_LEVELS = 3;

export const WORKFLOW_MODULES = [
  { key: "PRA_KARYAWAN", label: "Pra-Karyawan", desc: "Persetujuan hasil wawancara (bila dipakai) atau data calon sebelum didaftarkan sebagai karyawan." },
  { key: "CUTI", label: "Cuti", desc: "Pengajuan cuti dan izin karyawan." },
  { key: "DINAS", label: "Dinas Luar", desc: "Pengajuan dinas luar karyawan." },
  { key: "LEMBUR", label: "Lembur", desc: "Pengajuan lembur (modul Lembur menyusul).", soon: true },
  { key: "TUKAR_SHIFT", label: "Tukar Shift", desc: "Pengajuan tukar shift antarkaryawan (menyusul).", soon: true },
  { key: "PERUBAHAN_DATA", label: "Perubahan Data", desc: "Perubahan data pribadi dari Profil Saya (menyusul).", soon: true },
] as const;
export type WorkflowKey = (typeof WORKFLOW_MODULES)[number]["key"];

export type WorkflowModule = { enabled: boolean; levels: ApproverRef[] };
export type WorkflowSettings = Record<WorkflowKey, WorkflowModule>;

// Fitur Workflow aktif atau tidak (Pengaturan → Fitur). Nonaktif = semua approval ke atasan langsung, menu Workflow disembunyikan.
export const WORKFLOW_FEATURE_KEY = "feature-workflow";
export const readWorkflowFeature = (raw: unknown) => (raw as { enabled?: unknown } | null)?.enabled !== false;

const str = (v: unknown) => (typeof v === "string" ? v : "");

export function normalizeWorkflow(raw: unknown): WorkflowSettings {
  const v = (raw ?? {}) as Record<string, Record<string, unknown> | undefined>;
  const out = {} as WorkflowSettings;
  for (const m of WORKFLOW_MODULES) {
    const r = v[m.key] ?? {};
    const seen = new Set<string>();
    const levels = Array.isArray(r.levels)
      ? (r.levels as Record<string, unknown>[]).map((a) => ({ id: str(a?.id), name: str(a?.name) })).filter((a) => a.id && !seen.has(a.id) && seen.add(a.id))
      : [];
    out[m.key] = { enabled: r.enabled === true && !("soon" in m), levels: levels.slice(0, MAX_LEVELS) };
  }
  return out;
}

// Jejak approval berurutan dari level workflow. Pemohon tidak bisa menyetujui pengajuannya sendiri, jadi levelnya dilewati.
export function stepsFromLevels(levels: ApproverRef[], requesterId = ""): InterviewApproval | null {
  const steps: ApprovalStep[] = levels.filter((l) => l.id !== requesterId).map((l) => ({ id: l.id, name: l.name, decision: "", at: "", note: "" }));
  return steps.length ? { mode: steps.length > 1 ? "SIRKULAR" : "TUNGGAL", order: "BERURUTAN", steps } : null;
}

export function readApproval(raw: unknown): InterviewApproval | null {
  const a = raw as Record<string, unknown> | null | undefined;
  if (!a || !Array.isArray(a.steps)) return null;
  return {
    mode: a.mode === "SIRKULAR" ? "SIRKULAR" : "TUNGGAL",
    order: a.order === "BERSAMAAN" ? "BERSAMAAN" : "BERURUTAN",
    steps: (a.steps as Record<string, unknown>[]).map((s) => ({
      id: str(s?.id), name: str(s?.name), decision: s?.decision === "SETUJU" || s?.decision === "TOLAK" ? s.decision : "", at: str(s?.at), note: str(s?.note),
    })),
  };
}
