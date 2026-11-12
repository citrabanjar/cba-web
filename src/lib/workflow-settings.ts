import { prisma } from "@/lib/prisma";
import { actionableApprovers, approvalComplete, stepCandidates, type ApprovalStep, type InterviewApproval } from "@/lib/onboarding-interview";
import { levelTitle, normalizeWorkflow, readWorkflowFeature, WORKFLOW_FEATURE_KEY, WORKFLOW_KEY, type WorkflowKey, type WorkflowLevel, type WorkflowSettings } from "@/lib/workflow";

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

const same = (a: string | null | undefined, b: string) => (a ?? "").trim().toLowerCase() === b.trim().toLowerCase();

// Naik mengikuti bagan organisasi (atasan langsung → atasan dari atasan → …) dari pemohon sampai ketemu jabatan itu.
// Atasan yang sudah tidak aktif dilewati (naik terus ke atasannya). Dibatasi 20 tingkat supaya data berputar tidak macet.
async function findUpChain(requesterId: string, position: string) {
  let cur = await prisma.user.findUnique({ where: { id: requesterId }, select: { managerId: true } });
  const seen = new Set<string>([requesterId]);
  for (let i = 0; i < 20 && cur?.managerId && !seen.has(cur.managerId); i++) {
    seen.add(cur.managerId);
    const boss = await prisma.user.findUnique({ where: { id: cur.managerId }, select: { id: true, name: true, position: true, isActive: true, managerId: true } });
    if (!boss) return null;
    if (boss.isActive && same(boss.position, position)) return { id: boss.id, name: boss.name };
    cur = boss;
  }
  return null;
}

// Siapa yang memegang level ini (karyawan aktif).
// Jabatan: dicari di rantai atasan pemohon pada bagan organisasi; tanpa pemohon (Pra-Karyawan) semua pemegang jabatan itu.
async function levelHolders(l: WorkflowLevel, requesterId: string) {
  if (l.type === "EMPLOYEE") return prisma.user.findMany({ where: { id: l.value, isActive: true }, select: { id: true, name: true } });
  if (l.type === "ROLE") {
    const [role, menu] = l.value.split(":");
    const list = await prisma.user.findMany({ where: { role: role as "ADMIN" | "SUPER_ADMIN", isActive: true }, select: { id: true, name: true, menuAccess: true } });
    return menu ? list.filter((u) => u.menuAccess.includes(menu)) : list;
  }
  if (requesterId) {
    const boss = await findUpChain(requesterId, l.value);
    return boss ? [boss] : [];
  }
  return prisma.user.findMany({ where: { isActive: true, position: { equals: l.value, mode: "insensitive" } }, select: { id: true, name: true } });
}

// Jalur approval workflow untuk pengajuan baru (dihitung saat pengajuan dikirim).
// flow null = modul tidak aktif → aturan default (atasan langsung). Level yang hanya berisi pemohon sendiri dilewati;
// level yang tidak punya pemegang sama sekali membuat pengajuan gagal (tidak boleh terlewat diam-diam).
export async function workflowSteps(module: WorkflowKey, requesterId = ""): Promise<{ flow: InterviewApproval | null; error?: string }> {
  const m = (await getWorkflow())[module];
  if (!m.enabled || !m.levels.length) return { flow: null };
  const steps: ApprovalStep[] = [];
  for (const [i, l] of m.levels.entries()) {
    const holders = await levelHolders(l, requesterId);
    if (!holders.length) {
      return { flow: null, error: l.type === "POSITION" && requesterId
        ? `Approver Level ${i + 1} (${levelTitle(l)}) tidak ditemukan di atas Anda pada bagan organisasi. Minta HRD memeriksa atasan langsung di profil Anda.`
        : `Approver Level ${i + 1} (${levelTitle(l)}) tidak ditemukan di data karyawan aktif. Hubungi Admin untuk memperbaiki menu Workflow.` };
    }
    const ids = holders.map((h) => h.id).filter((id) => id !== requesterId);
    if (!ids.length) continue;
    // Karyawan tertentu / jabatan di rantai atasan = satu orang → tampil "Jabatan X · Nama".
    const title = l.type === "EMPLOYEE" ? holders[0].name : l.type === "POSITION" && requesterId ? `${levelTitle(l)} · ${holders[0].name}` : levelTitle(l);
    steps.push({ id: ids[0], name: title, decision: "", at: "", note: "", ...(l.type === "EMPLOYEE" ? {} : { ids }) });
  }
  if (!steps.length) return { flow: null };
  return { flow: { mode: steps.length > 1 ? "SIRKULAR" : "TUNGGAL", order: "BERURUTAN", steps } };
}

// User cocok dengan salah satu level (karyawan, jabatan, atau hak akses).
export async function matchesLevels(userId: string, levels: WorkflowLevel[]) {
  if (!levels.length) return false;
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { position: true, role: true, menuAccess: true } });
  if (!u) return false;
  return levels.some((l) => {
    if (l.type === "EMPLOYEE") return l.value === userId;
    if (l.type === "POSITION") return same(u.position, l.value);
    const [role, menu] = l.value.split(":");
    return u.role === role && (!menu || u.menuAccess.includes(menu));
  });
}

// User ini approver di salah satu modul workflow yang aktif.
export async function isWorkflowApprover(userId: string) {
  const w = await getWorkflow();
  return matchesLevels(userId, Object.values(w).filter((m) => m.enabled).flatMap((m) => m.levels));
}

// Keputusan satu level. Hasil: jejak baru, sudah selesai (semua setuju) atau ditolak.
export function decideStep(approval: InterviewApproval, userId: string, approve: boolean, note: string, byName: string | null = null) {
  if (!actionableApprovers(approval).includes(userId)) return { error: "Belum giliran Anda memutus, atau Anda bukan penyetuju pengajuan ini." } as const;
  const step = approval.steps.find((s) => !s.decision && stepCandidates(s).includes(userId))!;
  step.decision = approve ? "SETUJU" : "TOLAK";
  step.at = new Date().toISOString();
  step.note = note.trim();
  step.by = byName ?? "";
  if (step.ids?.length) step.id = userId;
  return { approval, step, rejected: !approve, done: approve && approvalComplete(approval) } as const;
}
