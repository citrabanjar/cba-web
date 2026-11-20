import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notify";
import { actionableApprovers, approvalComplete, readApproval, stepCandidates, type ApprovalStep, type InterviewApproval } from "@/lib/onboarding-interview";
import { getAdminRoles, roleMembers } from "@/lib/admin-roles";
import { levelTitle, ROLE_GROUP_PREFIX, normalizeWorkflow, readWorkflowFeature, WORKFLOW_FEATURE_KEY, WORKFLOW_KEY, type WorkflowKey, type WorkflowLevel, type WorkflowSettings } from "@/lib/workflow";

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

// Rantai atasan pemohon di bagan organisasi (isian "atasan langsung" di profil), dari yang terdekat ke puncak.
// Atasan yang sudah tidak aktif dilewati (naik terus). Dibatasi 20 tingkat supaya data berputar tidak macet.
async function chainOf(userId: string) {
  const out: { id: string; name: string }[] = [];
  const seen = new Set([userId]);
  let cur = await prisma.user.findUnique({ where: { id: userId }, select: { managerId: true } });
  for (let i = 0; i < 20 && cur?.managerId && !seen.has(cur.managerId); i++) {
    seen.add(cur.managerId);
    const boss = await prisma.user.findUnique({ where: { id: cur.managerId }, select: { id: true, name: true, isActive: true, managerId: true } });
    if (!boss) break;
    if (boss.isActive) out.push({ id: boss.id, name: boss.name });
    cur = boss;
  }
  return out;
}

// Pemegang level hak akses / karyawan tertentu (karyawan aktif).
async function levelHolders(l: WorkflowLevel) {
  if (l.type === "EMPLOYEE") return prisma.user.findMany({ where: { id: l.value, isActive: true }, select: { id: true, name: true } });
  if (l.value.startsWith(ROLE_GROUP_PREFIX)) return roleMembers(l.value.slice(ROLE_GROUP_PREFIX.length));
  const [role, menu] = l.value.split(":");
  const list = await prisma.user.findMany({ where: { role: role as "ADMIN" | "SUPER_ADMIN", isActive: true }, select: { id: true, name: true, menuAccess: true } });
  return menu ? list.filter((u) => u.menuAccess.includes(menu)) : list;
}

// Jalur approval workflow untuk pengajuan baru (dihitung saat pengajuan dikirim). flow null = modul tidak aktif → aturan default.
// - Karyawan tertentu: orang itu (bila pemohon sendiri → level dilewati).
// - Hak akses: anggota peran yang berada di rantai atasan pemohon, yang terdekat; tidak pernah menyeberang ke cabang bagan lain.
//   Pemohon sendiri anggota peran itu → level dilewati. Tidak ada anggota di rantai atasannya → pengajuan gagal (hubungi HRD).
// - Default (atasan di bagan): atasan langsung (1) atau atasan dari atasan langsung (2) pemohon; tidak ada → pengajuan gagal (hubungi HRD).
// - Hanya info: orangnya tidak memutus, hanya dicatat untuk diberi notifikasi saat pengajuan disetujui (tidak ada → dilewati).
// - Pemeriksa dokumen (Pinjaman): semua anggota perannya boleh mengerjakan (tidak dicari lewat bagan).
// - Orang yang sama tidak memutus dua kali: level sebelumnya dilewati bila orangnya muncul lagi di level sesudahnya.
export async function workflowSteps(module: WorkflowKey, requesterId: string): Promise<{ flow: InterviewApproval | null; error?: string }> {
  const m = (await getWorkflow())[module];
  if (!m.enabled || !m.levels.length) return { flow: null };
  const chain = await chainOf(requesterId);
  const raw: ApprovalStep[] = [];
  const info: { id: string; name: string }[] = [];
  for (const [i, l] of m.levels.entries()) {
    if (l.type === "MANAGER") {
      const boss = chain[Number(l.value) - 1];
      const title = levelTitle(l);
      if (l.info) { if (boss) info.push({ id: boss.id, name: `${title} · ${boss.name}` }); continue; }
      if (!boss) return { flow: null, error: `Penyetuju Level ${i + 1} (${title}) untuk Anda belum diatur di bagan organisasi. Hubungi HRD.` };
      raw.push({ id: boss.id, name: `${title} · ${boss.name}`, decision: "", at: "", note: "" });
      continue;
    }
    const holders = await levelHolders(l);
    const title = l.type === "EMPLOYEE" ? holders[0]?.name ?? l.label : levelTitle(l);
    if (l.info) {
      // Hanya info: karyawan tertentu / anggota peran terdekat di rantai atasan (bila tidak ada di rantai: semua anggota peran).
      const hit = l.type === "EMPLOYEE" ? holders : chain.filter((c) => holders.some((h) => h.id === c.id)).slice(0, 1);
      for (const h of (hit.length ? hit : holders)) if (h.id !== requesterId) info.push({ id: h.id, name: `${title} · ${h.name}` });
      continue;
    }
    if (!holders.length) return { flow: null, error: `Approver Level ${i + 1} (${title}) tidak ditemukan di data karyawan aktif. Hubungi Admin untuk memperbaiki menu Workflow.` };
    if (l.check) {
      const ids = holders.map((h) => h.id).filter((id) => id !== requesterId);
      if (!ids.length) return { flow: null, error: `Pemeriksa dokumen (${title}) belum punya anggota lain yang aktif. Hubungi HRD.` };
      raw.push({ id: ids[0], name: title, decision: "", at: "", note: "", ...(l.type === "EMPLOYEE" ? {} : { ids }), check: true });
      continue;
    }
    if (holders.some((h) => h.id === requesterId)) continue;
    // Perubahan Data: penyetuju bukan atasan pemohon (Admin / Kepala HRD), jadi semua anggota peran boleh memutus.
    if (module === "PERUBAHAN_DATA" && l.type !== "EMPLOYEE") {
      raw.push({ id: holders[0].id, name: title, decision: "", at: "", note: "", ids: holders.map((h) => h.id) });
      continue;
    }
    if (l.type === "EMPLOYEE") {
      raw.push({ id: holders[0].id, name: title, decision: "", at: "", note: "" });
      continue;
    }
    const hit = chain.find((c) => holders.some((h) => h.id === c.id));
    if (!hit) return { flow: null, error: `Penyetuju Level ${i + 1} (${title}) untuk Anda belum terdaftar di bagan organisasi. Hubungi HRD.` };
    raw.push({ id: hit.id, name: `${title} · ${hit.name}`, decision: "", at: "", note: "" });
  }
  const steps = raw.filter((x, i) => x.check || !raw.slice(i + 1).some((y) => !y.check && y.id === x.id));
  if (!steps.length) return { flow: null };
  // Penerima info yang juga penyetuju tidak diberi info lagi.
  const cc = info.filter((x, i) => !steps.some((s) => s.id === x.id) && info.findIndex((y) => y.id === x.id) === i);
  return { flow: { mode: steps.length > 1 ? "SIRKULAR" : "TUNGGAL", order: "BERURUTAN", steps, ...(cc.length ? { info: cc } : {}) } };
}

// User cocok dengan salah satu level (karyawan, jabatan, atau hak akses).
export async function matchesLevels(userId: string, levels: WorkflowLevel[]) {
  if (!levels.length) return false;
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, menuAccess: true } });
  if (!u) return false;
  const groups = levels.some((l) => l.value.startsWith(ROLE_GROUP_PREFIX)) ? await getAdminRoles() : [];
  return levels.some((l) => {
    if (l.info || l.type === "MANAGER") return false; // atasan sudah penyetuju lewat bagan; Hanya info bukan penyetuju
    if (l.type === "EMPLOYEE") return l.value === userId;
    if (l.value.startsWith(ROLE_GROUP_PREFIX)) return !!groups.find((g) => `${ROLE_GROUP_PREFIX}${g.id}` === l.value)?.members.includes(userId);
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

// Kirim notifikasi ke penerima "Hanya info" (Workflow) setelah pengajuan disetujui level terakhir.
export async function notifyInfo(rawApproval: unknown, title: string, body: string) {
  const ids = (readApproval(rawApproval)?.info ?? []).map((x) => x.id);
  if (ids.length) await notify(ids, title, body, null);
}
