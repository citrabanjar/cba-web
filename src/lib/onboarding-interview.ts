// Tahap wawancara onboarding. Aman dipakai di server dan browser.
// Super Admin hanya menyalakan modul Pra-Karyawan (Pengaturan → Fitur). Reviewer dipilih HRD per calon di kotak Reviewer
// saat memeriksa isian calon dengan berkas asli:
//   [x] Wawancara → pewawancara (Employee ID, boleh lebih dari satu) mengisi penilaian + catatan sendiri di menu Persetujuan.
//   [x] Approval  → approver (Employee ID, boleh lebih dari satu, berurutan) menyetujui / menolak dengan catatan.
//   Tanpa wawancara, approval wajib. Setelah semua beres, berkas kembali ke Admin (bisa dicetak) untuk dilanjutkan.
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

// Pilihan reviewer per calon (kotak Reviewer).
export type OnboardingFlow = { interview: boolean; interviewers: ApproverRef[]; approval: boolean; approvers: ApproverRef[] };
const refs = (raw: unknown) => {
  const seen = new Set<string>();
  return Array.isArray(raw)
    ? (raw as Record<string, unknown>[]).map((a) => ({ id: str(a?.id), name: str(a?.name) })).filter((a) => a.id && !seen.has(a.id) && seen.add(a.id)).slice(0, 10)
    : [];
};
export function normalizeOnboardingFlow(raw: unknown, legacyInterview = false): OnboardingFlow {
  const v = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  if (!v) return { interview: legacyInterview, interviewers: [], approval: true, approvers: [] };
  const interview = v.interview === true;
  // Tanpa wawancara, approval wajib.
  return { interview, interviewers: refs(v.interviewers), approval: interview ? v.approval !== false : true, approvers: refs(v.approvers) };
}
// Yang masih kurang di setup alur (kosong = siap dipakai).
export function flowProblems(f: OnboardingFlow): string[] {
  const out: string[] = [];
  if (f.interview && !f.interviewers.length) out.push("Pilih minimal satu pewawancara.");
  if (f.approval && !f.approvers.length) out.push("Pilih minimal satu approver.");
  return out;
}

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
// Penilaian satu pewawancara (diisi sendiri di menu Persetujuan). at = waktu dikirim; kosong = belum.
// offer = tawaran kerja usulan pewawancara ini (approver memilih salah satu sebagai keputusan akhir).
export type Review = { id: string; name: string; date: string; score: string; recommendation: string; notes: string; at: string; offer: Offer | null };
export const emptyReview = (id: string, name: string): Review => ({ id, name, date: "", score: "", recommendation: "", notes: "", at: "", offer: null });
export function missingReview(r: Review): string[] {
  const m: string[] = [];
  if (!r.date) m.push("Tanggal wawancara");
  if (!r.score) m.push("Nilai");
  if (!r.recommendation) m.push("Rekomendasi");
  return m;
}
// offer = usulan final dari approver ini (jalur wawancara). pick = data lama (memilih tawaran pewawancara).
export type ApprovalStep = { id: string; name: string; decision: "" | "SETUJU" | "TOLAK"; at: string; note: string; ids?: string[]; by?: string; pick?: string; offer?: Offer };
export const stepCandidates = (s: ApprovalStep) => (s.ids?.length ? s.ids : [s.id]);
export type InterviewApproval = { mode: ApprovalMode; order: ApprovalOrder; steps: ApprovalStep[] };
export type Interview = {
  date: string; interviewer: string; score: string; notes: string; recommendation: string;
  offer: Offer;
  approval: InterviewApproval | null;
  submittedBy: string; submittedAt: string; approvedAt: string;
  skipped: boolean; // true = tanpa wawancara; hanya jejak workflow approval data calon
  reviews: Review[]; // penilaian per pewawancara (alur baru); kosong = data lama (satu isian HRD)
  approvers: ApproverRef[]; // approver yang dipilih HRD untuk setelah wawancara (kosong = tanpa approval)
  placement: Offer | null; // usulan penempatan dari HRD (Data Pekerjaan saat dikirim ke reviewer)
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
  approval: null, submittedBy: "", submittedAt: "", approvedAt: "", skipped: false, reviews: [], approvers: [], placement: null,
});

export function readOffer(raw: unknown): Offer | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const out = emptyOffer();
  for (const k of Object.keys(out) as (keyof Offer)[]) if (typeof o[k] === "string") out[k] = o[k] as string;
  return out;
}
// Isian tawaran yang dibandingkan antar-pewawancara (yang berbeda di-highlight).
export const OFFER_FIELDS: (keyof Offer)[] = ["position", "departmentName", "branch", "managerId", "employmentStatus", "salary", "joinDate", "contractEndDate"];
// Pewawancara yang sudah mengirim tawaran (pilihan keputusan akhir approver).
export const offerChoices = (i: Interview | null) => (i?.reviews ?? []).filter((r) => r.at && r.offer).map((r) => ({ id: r.id, name: r.name }));

export function readInterview(raw: unknown): Interview | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as Record<string, unknown>;
  const base = emptyInterview();
  for (const k of ["date", "interviewer", "score", "notes", "recommendation", "submittedBy", "submittedAt", "approvedAt"] as const) base[k] = str(v[k]);
  base.skipped = v.skipped === true;
  base.offer = readOffer(v.offer) ?? base.offer;
  base.approval = readApproval(v.approval);
  base.reviews = Array.isArray(v.reviews)
    ? (v.reviews as Record<string, unknown>[]).map((x) => ({
        id: str(x?.id), name: str(x?.name), date: str(x?.date), score: str(x?.score),
        recommendation: str(x?.recommendation), notes: str(x?.notes), at: str(x?.at), offer: readOffer(x?.offer),
      })).filter((x) => x.id)
    : [];
  base.approvers = refs(v.approvers);
  base.placement = readOffer(v.placement);
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
      ...(typeof s?.pick === "string" ? { pick: s.pick } : {}),
      ...(readOffer(s?.offer) ? { offer: readOffer(s?.offer)! } : {}),
    })),
  };
}

// Tawaran kerja yang wajib lengkap sebelum hasil wawancara diajukan ke approval.
export function missingOffer(i: Interview): string[] {
  const miss: string[] = [];
  if (!i.offer.departmentName.trim()) miss.push("Departemen (tawaran)");
  if (!i.offer.position.trim()) miss.push("Jabatan (tawaran)");
  if (!i.offer.managerId) miss.push("Calon atasan langsung");
  if (!(Number(i.offer.salary) > 0)) miss.push("Gaji pokok yang ditawarkan");
  if (!i.offer.joinDate) miss.push("Rencana tanggal masuk");
  if (i.offer.employmentStatus === "KONTRAK" && !i.offer.contractEndDate) miss.push("Tanggal akhir kontrak (tawaran)");
  return miss;
}
// Pewawancara yang belum mengirim penilaian.
export const pendingReviews = (i: Interview | null) => (i?.reviews ?? []).filter((r) => !r.at);
// Wawancara berurutan: giliran = pewawancara pertama yang belum menilai (pewawancara berikutnya melihat hasil sebelumnya).
export const currentReviewer = (i: Interview | null) => pendingReviews(i)[0] ?? null;
// Usulan terakhir (approver → pewawancara → HRD): isian awal usulan berikutnya.
export function latestOffer(i: Interview): Offer {
  const steps = (i.approval?.steps ?? []).filter((x) => x.decision === "SETUJU" && x.offer);
  const reviewed = i.reviews.filter((r) => r.at && r.offer);
  return steps.at(-1)?.offer ?? reviewed.at(-1)?.offer ?? i.placement ?? i.offer;
}
// Semua syarat sebelum hasil wawancara diajukan: semua pewawancara sudah menilai + tawaran lengkap.
export function missingInterview(i: Interview): string[] {
  const waiting = pendingReviews(i).map((r) => `Penilaian ${r.name}`);
  return [...waiting, ...missingOffer(i)];
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
// Tanpa approval (setup alur): lolos begitu semua pewawancara menilai (approvedAt terisi, approval kosong).
export const interviewApproved = (i: Interview | null) => !!i && !i.skipped && (approvalComplete(i.approval) || (!i.approval && !!i.approvedAt));
// Susun jejak approval dari daftar approver (berurutan).
export const approvalFrom = (approvers: ApproverRef[]): InterviewApproval => ({
  mode: approvers.length > 1 ? "SIRKULAR" : "TUNGGAL", order: "BERURUTAN",
  steps: approvers.map((a) => ({ id: a.id, name: a.name, decision: "", at: "", note: "" })),
});
// Status calon yang sedang berjalan workflow approval (wawancara atau data calon).
export const APPROVAL_STATUSES = ["APPROVAL_WAWANCARA", "MENUNGGU_APPROVAL"];

export const rupiah = (v: string | number) => `Rp${Math.round(Number(v) || 0).toLocaleString("id-ID")}`;
