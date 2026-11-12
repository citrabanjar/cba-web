import { prisma } from "@/lib/prisma";
import { actionableApprovers, approvalComplete, stepCandidates, type ApprovalStep, type InterviewApproval } from "@/lib/onboarding-interview";
import { chainTitle, levelTitle, normalizeWorkflow, readWorkflowFeature, WORKFLOW_FEATURE_KEY, WORKFLOW_KEY, type WorkflowKey, type WorkflowLevel, type WorkflowSettings } from "@/lib/workflow";

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

// Satu tingkat ke atas di bagan organisasi (isian "atasan langsung" di profil): atasan dari `fromId`.
// Atasan yang kosong / sudah tidak aktif dilewati → naik terus ke atasnya. Dibatasi 20 tingkat supaya data berputar tidak macet.
async function nextUp(fromId: string, seen: Set<string>) {
  let cur = await prisma.user.findUnique({ where: { id: fromId }, select: { managerId: true } });
  for (let i = 0; i < 20 && cur?.managerId && !seen.has(cur.managerId); i++) {
    seen.add(cur.managerId);
    const boss = await prisma.user.findUnique({ where: { id: cur.managerId }, select: { id: true, name: true, isActive: true, managerId: true } });
    if (!boss) return null;
    if (boss.isActive) return { id: boss.id, name: boss.name };
    cur = boss;
  }
  return null;
}

// Pemegang level hak akses / karyawan tertentu (karyawan aktif).
async function levelHolders(l: WorkflowLevel) {
  if (l.type === "EMPLOYEE") return prisma.user.findMany({ where: { id: l.value, isActive: true }, select: { id: true, name: true } });
  const [role, menu] = l.value.split(":");
  const list = await prisma.user.findMany({ where: { role: role as "ADMIN" | "SUPER_ADMIN", isActive: true }, select: { id: true, name: true, menuAccess: true } });
  return menu ? list.filter((u) => u.menuAccess.includes(menu)) : list;
}

// Jalur approval workflow untuk pengajuan baru (dihitung saat pengajuan dikirim).
// flow null = modul tidak aktif → aturan default (atasan langsung).
// Level "jabatan" mengikuti bagan organisasi: level jabatan ke-1 = atasan langsung pemohon, ke-2 = atasan dari atasan itu, dst.
// (atasan kosong / tidak aktif dilewati). Bila pemohon tidak punya atasan sama sekali → pengajuan gagal; bila rantai habis di
// level berikutnya (sudah sampai pucuk) → level itu dilewati. Level hak akses / karyawan yang tidak punya pemegang → gagal.
// chainStartId (Pra-Karyawan): calon atasan langsung → level jabatan ke-1 = orang itu, ke-2 = atasannya, dst.
export async function workflowSteps(module: WorkflowKey, requesterId = "", chainStartId = ""): Promise<{ flow: InterviewApproval | null; error?: string }> {
  const m = (await getWorkflow())[module];
  if (!m.enabled || !m.levels.length) return { flow: null };
  const steps: ApprovalStep[] = [];
  let chainFrom = requesterId;
  let chainLevel = 0;
  const seen = new Set<string>(requesterId ? [requesterId] : []);
  for (const [i, l] of m.levels.entries()) {
    if (l.type === "POSITION") {
      if (!requesterId && !chainStartId) return { flow: null, error: "Isi Calon atasan langsung dulu: approval level jabatan mengikuti bagan organisasi dari calon atasan itu." };
      let boss: { id: string; name: string } | null = null;
      if (!requesterId && chainLevel === 0) {
        // Calon atasan langsung sendiri (bila masih aktif), selain itu naik ke atasannya.
        const start = await prisma.user.findUnique({ where: { id: chainStartId }, select: { id: true, name: true, isActive: true } });
        seen.add(chainStartId);
        boss = start?.isActive ? { id: start.id, name: start.name } : start ? await nextUp(chainStartId, seen) : null;
      } else {
        boss = chainFrom ? await nextUp(chainFrom, seen) : null;
      }
      chainLevel++;
      if (!boss) {
        if (chainLevel === 1) return { flow: null, error: requesterId ? "Atasan langsung Anda belum diatur atau sudah tidak aktif, jadi pengajuan belum bisa dikirim. Hubungi HRD." : "Calon atasan langsung tidak aktif / tidak ditemukan. Pilih ulang di data calon." };
        chainFrom = "";
        continue; // sudah sampai pucuk bagan organisasi
      }
      chainFrom = boss.id;
      const title = requesterId ? chainTitle(chainLevel) : chainLevel === 1 ? "Calon atasan langsung" : chainLevel === 2 ? "Atasan dari calon atasan" : chainTitle(chainLevel);
      steps.push({ id: boss.id, name: `${title} · ${boss.name}`, decision: "", at: "", note: "" });
      continue;
    }
    const holders = await levelHolders(l);
    if (!holders.length) return { flow: null, error: `Approver Level ${i + 1} (${levelTitle(l)}) tidak ditemukan di data karyawan aktif. Hubungi Admin untuk memperbaiki menu Workflow.` };
    const ids = holders.map((h) => h.id).filter((id) => id !== requesterId);
    if (!ids.length) continue;
    const title = l.type === "EMPLOYEE" ? holders[0].name : levelTitle(l);
    steps.push({ id: ids[0], name: title, decision: "", at: "", note: "", ...(l.type === "EMPLOYEE" ? {} : { ids }) });
  }
  if (!steps.length) return { flow: null };
  return { flow: { mode: steps.length > 1 ? "SIRKULAR" : "TUNGGAL", order: "BERURUTAN", steps } };
}

// User cocok dengan salah satu level (karyawan, jabatan, atau hak akses).
export async function matchesLevels(userId: string, levels: WorkflowLevel[]) {
  if (!levels.length) return false;
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, menuAccess: true } });
  if (!u) return false;
  const subordinates = levels.some((l) => l.type === "POSITION") ? await prisma.user.count({ where: { managerId: userId, isActive: true } }) : 0;
  return levels.some((l) => {
    if (l.type === "EMPLOYEE") return l.value === userId;
    if (l.type === "POSITION") return subordinates > 0; // atasan di bagan organisasi

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
