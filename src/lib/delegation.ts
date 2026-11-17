// Delegasi tanggung jawab saat Cuti Tahunan (keputusan pemilik 2026-11-17):
// selama tanggal cuti yang SUDAH DISETUJUI, pengajuan BARU yang seharusnya diputus orang itu dialihkan ke delegasinya.
// Pengajuan yang sudah masuk sebelumnya tetap di orangnya; setelah cuti selesai jalur otomatis kembali.
// Bila delegasi sendiri yang mengajukan, pengajuan naik ke atasan dari orang yang cuti (bila ada).
// Pengalihan hanya satu langkah (delegasi dari delegasi tidak diteruskan).
import { prisma } from "@/lib/prisma";
import { todayDate } from "@/lib/leave-balance";
import type { ApprovalStep, InterviewApproval } from "@/lib/onboarding-interview";

type Person = { id: string; name: string };

// Delegasi aktif orang ini pada tanggal `on` (cuti disetujui yang punya delegasi), atau null.
export async function delegateOf(userId: string, on = todayDate()): Promise<Person | null> {
  const l = await prisma.leaveRequest.findFirst({
    where: { userId, status: "APPROVED", delegateId: { not: null }, startDate: { lte: on }, endDate: { gte: on } },
    select: { delegateId: true },
  });
  if (!l?.delegateId) return null;
  const d = await prisma.user.findUnique({ where: { id: l.delegateId }, select: { id: true, name: true, isActive: true } });
  return d?.isActive && d.id !== userId ? { id: d.id, name: d.name } : null;
}

// Penyetuju efektif untuk pengajuan baru. `from` = nama penyetuju asli bila dialihkan.
export async function routeTo(approver: Person, requesterId: string): Promise<Person & { from?: string }> {
  const d = await delegateOf(approver.id);
  if (!d) return approver;
  if (d.id !== requesterId) return { ...d, from: approver.name };
  // Delegasi sendiri yang mengajukan: naik ke atasan dari orang yang cuti.
  const up = await prisma.user.findUnique({ where: { id: approver.id }, select: { manager: { select: { id: true, name: true, isActive: true } } } });
  return up?.manager?.isActive && up.manager.id !== requesterId ? { id: up.manager.id, name: up.manager.name, from: approver.name } : approver;
}

export const delegateLabel = (p: { name: string; from?: string }) => (p.from ? `${p.name} (delegasi dari ${p.from})` : p.name);

// Terapkan delegasi ke langkah-langkah Workflow (pengajuan baru).
export async function delegateSteps(flow: InterviewApproval, requesterId: string): Promise<InterviewApproval> {
  const steps: ApprovalStep[] = [];
  for (const s of flow.steps) {
    if (s.ids?.length) {
      // Beberapa calon (mis. Pemeriksa dokumen): yang sedang cuti digantikan delegasinya.
      const ids: string[] = [];
      for (const id of s.ids) {
        const d = await delegateOf(id);
        const use = d && d.id !== requesterId ? d.id : id;
        if (!ids.includes(use)) ids.push(use);
      }
      steps.push({ ...s, id: ids[0], ids });
      continue;
    }
    const user = await prisma.user.findUnique({ where: { id: s.id }, select: { name: true } });
    const r = await routeTo({ id: s.id, name: user?.name ?? s.name }, requesterId);
    steps.push(r.from ? { ...s, id: r.id, name: `${s.name} · delegasi: ${r.name}` } : s);
  }
  return { ...flow, steps };
}

// Jalur default (atasan langsung): bila atasan sedang cuti dengan delegasi, pengajuan baru dicatat sebagai
// jalur satu langkah ke delegasinya; selain itu null (tetap atasan langsung).
export async function defaultDelegateFlow(requesterId: string): Promise<InterviewApproval | null> {
  const u = await prisma.user.findUnique({ where: { id: requesterId }, select: { manager: { select: { id: true, name: true, isActive: true } } } });
  const m = u?.manager;
  if (!m?.isActive || m.id === requesterId) return null;
  const r = await routeTo({ id: m.id, name: m.name }, requesterId);
  if (!r.from) return null;
  return { mode: "TUNGGAL", order: "BERURUTAN", steps: [{ id: r.id, name: `Atasan langsung · ${delegateLabel(r)}`, decision: "", at: "", note: "" }] };
}

// Jalur approval pengajuan baru (cuti, dinas, lembur): Workflow bila aktif, lalu delegasi diterapkan.
export async function withDelegation(flow: InterviewApproval | null, requesterId: string) {
  return flow ? delegateSteps(flow, requesterId) : defaultDelegateFlow(requesterId);
}

// User ini penyetuju (punya bawahan, atau penyetuju di menu Workflow) → delegasi wajib saat Cuti Tahunan.
export async function isPersonApprover(userId: string) {
  if (await prisma.user.count({ where: { managerId: userId, isActive: true } })) return true;
  const { isWorkflowApprover } = await import("@/lib/workflow-settings");
  return isWorkflowApprover(userId);
}
