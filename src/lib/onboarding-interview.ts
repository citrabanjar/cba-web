// Tahap wawancara onboarding (diatur Super Admin di Pengaturan → Onboarding).
// Aman dipakai di server dan browser.
//
// Alur bila wawancara aktif:
//   WAWANCARA (HRD isi hasil + tawaran kerja) → APPROVAL_WAWANCARA (tunggal / sirkular)
//   → disetujui: DIUNDANG (undangan isi data terkirim) → DIKIRIM → HRD daftarkan karyawan (langsung masuk database).
// Bila wawancara tidak aktif: undang → isi data → HRD ajukan → approval sesuai workflow yang sama (tunggal / sirkular)
//   → SIAP_DAFTAR → HRD daftarkan karyawan. Jejak approval disimpan di kolom interview dengan skipped = true.

export const ONBOARDING_SETTING_KEY = "onboarding";

export type ApprovalMode = "TUNGGAL" | "SIRKULAR";
export type ApprovalOrder = "BERURUTAN" | "BERSAMAAN";
export type ApproverRef = { id: string; name: string };
export type OnboardingSettings = { enabled: boolean; interview: boolean; mode: ApprovalMode; order: ApprovalOrder; approvers: ApproverRef[] };

export const DEFAULT_ONBOARDING_SETTINGS: OnboardingSettings = { enabled: true, interview: false, mode: "TUNGGAL", order: "BERURUTAN", approvers: [] };

const str = (v: unknown) => (typeof v === "string" ? v : "");

export function normalizeOnboardingSettings(raw: unknown): OnboardingSettings {
  const v = (raw ?? {}) as Record<string, unknown>;
  const seen = new Set<string>();
  const approvers = Array.isArray(v.approvers)
    ? (v.approvers as Record<string, unknown>[])
        .map((a) => ({ id: str(a?.id), name: str(a?.name) }))
        .filter((a) => a.id && !seen.has(a.id) && seen.add(a.id))
    : [];
  return {
    // Modul Pra-Karyawan aktif kecuali dimatikan Super Admin (perusahaan tidak butuh onboarding di portal).
    enabled: v.enabled !== false,
    interview: v.interview === true,
    mode: v.mode === "SIRKULAR" ? "SIRKULAR" : "TUNGGAL",
    order: v.order === "BERSAMAAN" ? "BERSAMAAN" : "BERURUTAN",
    approvers: approvers.slice(0, 10),
  };
}

// ─── Hasil wawancara + tawaran kerja ───────────────────────────────────────

export type Offer = {
  departmentName: string; position: string; branch: string;
  employmentStatus: string; salary: string; joinDate: string; contractEndDate: string;
  managerId: string; managerName: string; // calon atasan langsung
};
// Satu level approval. ids = calon approver (pemegang jabatan / hak akses); salah satu cukup memutus, namanya dicatat di "by".
// Tanpa ids: id = satu karyawan tertentu.
export type ApprovalStep = { id: string; name: string; decision: "" | "SETUJU" | "TOLAK"; at: string; note: string; ids?: string[]; by?: string };
export const stepCandidates = (s: ApprovalStep) => (s.ids?.length ? s.ids : [s.id]);
export type InterviewApproval = { mode: ApprovalMode; order: ApprovalOrder; steps: ApprovalStep[] };
export type Interview = {
  date: string; interviewer: string; score: string; notes: string; recommendation: string;
  offer: Offer;
  approval: InterviewApproval | null;
  submittedBy: string; submittedAt: string; approvedAt: string;
  skipped: boolean; // true = tanpa wawancara; hanya jejak workflow approval data calon
};

export const SCORES = [
  { value: "5", label: "5 · Sangat baik" }, { value: "4", label: "4 · Baik" }, { value: "3", label: "3 · Cukup" },
  { value: "2", label: "2 · Kurang" }, { value: "1", label: "1 · Sangat kurang" },
];
export const RECOMMENDATIONS = [
  { value: "DITERIMA", label: "Disarankan diterima" },
  { value: "DIPERTIMBANGKAN", label: "Dipertimbangkan" },
  { value: "TIDAK", label: "Tidak disarankan" },
];

export const emptyOffer = (): Offer => ({ departmentName: "", position: "", branch: "", employmentStatus: "KONTRAK", salary: "", joinDate: "", contractEndDate: "", managerId: "", managerName: "" });
export const emptyInterview = (): Interview => ({
  date: "", interviewer: "", score: "", notes: "", recommendation: "", offer: emptyOffer(),
  approval: null, submittedBy: "", submittedAt: "", approvedAt: "", skipped: false,
});

export function readInterview(raw: unknown): Interview | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as Record<string, unknown>;
  const base = emptyInterview();
  for (const k of ["date", "interviewer", "score", "notes", "recommendation", "submittedBy", "submittedAt", "approvedAt"] as const) base[k] = str(v[k]);
  base.skipped = v.skipped === true;
  const o = (v.offer ?? {}) as Record<string, unknown>;
  for (const k of Object.keys(base.offer) as (keyof Offer)[]) if (typeof o[k] === "string") base.offer[k] = o[k] as string;
  base.approval = readApproval(v.approval);
  return base;
}

// Jejak approval tersimpan (Pra-Karyawan, cuti, dinas) dibaca ulang dengan aman.
export function readApproval(raw: unknown): InterviewApproval | null {
  const a = raw as Record<string, unknown> | null | undefined;
  if (!a || !Array.isArray(a.steps)) return null;
  return {
    mode: a.mode === "SIRKULAR" ? "SIRKULAR" : "TUNGGAL",
    order: a.order === "BERSAMAAN" ? "BERSAMAAN" : "BERURUTAN",
    steps: (a.steps as Record<string, unknown>[]).map((s) => ({
      id: str(s?.id), name: str(s?.name), decision: s?.decision === "SETUJU" || s?.decision === "TOLAK" ? s.decision : "", at: str(s?.at), note: str(s?.note),
      ...(Array.isArray(s?.ids) ? { ids: (s.ids as unknown[]).filter((x): x is string => typeof x === "string") } : {}),
      ...(typeof s?.by === "string" ? { by: s.by } : {}),
    })),
  };
}

// Isian HRD yang wajib sebelum hasil wawancara diajukan.
export function missingInterview(i: Interview): string[] {
  const miss: string[] = [];
  if (!i.date) miss.push("Tanggal wawancara");
  if (!i.interviewer.trim()) miss.push("Pewawancara");
  if (!i.score) miss.push("Nilai");
  if (!i.recommendation) miss.push("Rekomendasi");
  if (!i.offer.departmentName.trim()) miss.push("Departemen (tawaran)");
  if (!i.offer.position.trim()) miss.push("Jabatan (tawaran)");
  if (!i.offer.managerId) miss.push("Calon atasan langsung");
  if (!(Number(i.offer.salary) > 0)) miss.push("Gaji pokok yang ditawarkan");
  if (!i.offer.joinDate) miss.push("Rencana tanggal masuk");
  if (i.offer.employmentStatus === "KONTRAK" && !i.offer.contractEndDate) miss.push("Tanggal akhir kontrak (tawaran)");
  return miss;
}

// Approver yang saat ini boleh memberi keputusan: berurutan = approver pertama yang belum memutus;
// bersamaan = semua yang belum memutus. Kosong bila sudah ada yang menolak atau semua setuju.
export function actionableApprovers(a: InterviewApproval | null): string[] {
  if (!a || a.steps.some((s) => s.decision === "TOLAK")) return [];
  const open = a.steps.filter((s) => !s.decision);
  if (!open.length) return [];
  return a.order === "BERURUTAN" || a.mode === "TUNGGAL" ? stepCandidates(open[0]) : open.flatMap(stepCandidates);
}
export const approvalComplete = (a: InterviewApproval | null) => !!a && a.steps.length > 0 && a.steps.every((s) => s.decision === "SETUJU");
// Calon ini lewat jalur wawancara yang sudah disetujui: HRD langsung mendaftarkan karyawan, tanpa approval akhir.
export const interviewApproved = (i: Interview | null) => !!i && !i.skipped && approvalComplete(i.approval);
// Status calon yang sedang berjalan workflow approval (wawancara atau data calon).
export const APPROVAL_STATUSES = ["APPROVAL_WAWANCARA", "MENUNGGU_APPROVAL"];

export const rupiah = (v: string | number) => `Rp${Math.round(Number(v) || 0).toLocaleString("id-ID")}`;
