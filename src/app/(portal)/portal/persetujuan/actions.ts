"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getAccess } from "@/lib/access";
import { canDecide } from "@/lib/approval";
import { assessAttendance } from "@/lib/attendance-assess";
import { decideStep } from "@/lib/workflow-settings";
import { readApproval } from "@/lib/onboarding-interview";
import { dateRange, decisionText, notify } from "@/lib/notify";

// Keputusan per level menu Workflow. Hasil null = bukan jalur workflow (pakai atasan langsung).
function workflowDecision(raw: unknown, userId: string, approve: boolean, note: string, name: string | null) {
  const flow = readApproval(raw);
  if (!flow) return null;
  return decideStep(flow, userId, approve, note, name);
}

type Result = { error?: string };

async function approver() {
  const session = await auth();
  const access = await getAccess();
  if (!session?.user?.id || !access) throw new Error("Unauthorized");
  return { id: session.user.id, role: access.role, name: session.user.name ?? null };
}

function refresh() {
  for (const p of ["/portal/persetujuan", "/portal/cuti", "/portal/dinas", "/portal/dashboard", "/portal/admin/leave"]) revalidatePath(p);
  revalidatePath("/portal/admin/karyawan", "layout");
}

// Setujui atau tolak pengajuan cuti. Alasan wajib saat menolak.
export async function decideLeave(id: string, approve: boolean, note: string): Promise<Result> {
  const a = await approver();
  const req = await prisma.leaveRequest.findUnique({ where: { id }, include: { policy: { select: { name: true } } } });
  if (!req || req.status !== "PENDING") return { error: "Pengajuan tidak ditemukan atau sudah diputus." };
  if (!approve && !note.trim()) return { error: "Tulis alasan penolakan." };
  const wf = workflowDecision(req.approval, a.id, approve, note, a.name);
  if (wf && "error" in wf) return { error: wf.error };
  if (wf && !wf.rejected && !wf.done) {
    // Level berikutnya masih harus memutus.
    await prisma.leaveRequest.update({ where: { id }, data: { approval: wf.approval } });
    refresh();
    return {};
  }
  if (!wf && !(await canDecide(a, req.userId))) return { error: "Anda bukan penyetuju pengajuan ini." };
  await prisma.leaveRequest.update({
    where: { id },
    data: { status: approve ? "APPROVED" : "REJECTED", approvedBy: a.name, approvedAt: new Date(), note: note.trim() || null, ...(wf ? { approval: wf.approval } : {}) },
  });
  // Alpha otomatis di tanggal cuti yang disetujui langsung dihapus.
  if (approve) await assessAttendance(req.startDate, req.endDate, [req.userId]);
  await notify(req.userId, `Pengajuan ${req.policy?.name ?? "cuti"} ${approve ? "disetujui" : "ditolak"}`,
    `${dateRange(req.startDate, req.endDate)} · ${decisionText(approve, a.name, note)}`, "/portal/cuti");
  refresh();
  return {};
}

export async function decideTrip(id: string, approve: boolean, note: string): Promise<Result> {
  const a = await approver();
  const trip = await prisma.businessTrip.findUnique({ where: { id } });
  if (!trip || trip.status !== "PENDING") return { error: "Pengajuan tidak ditemukan atau sudah diputus." };
  if (!approve && !note.trim()) return { error: "Tulis alasan penolakan." };
  const wf = workflowDecision(trip.approval, a.id, approve, note, a.name);
  if (wf && "error" in wf) return { error: wf.error };
  if (wf && !wf.rejected && !wf.done) {
    await prisma.businessTrip.update({ where: { id }, data: { approval: wf.approval } });
    refresh();
    return {};
  }
  if (!wf && !(await canDecide(a, trip.userId))) return { error: "Anda bukan penyetuju pengajuan ini." };
  await prisma.businessTrip.update({
    where: { id },
    data: { status: approve ? "APPROVED" : "REJECTED", approvedBy: a.name, approvedAt: new Date(), note: note.trim() || null, ...(wf ? { approval: wf.approval } : {}) },
  });
  if (approve) await assessAttendance(trip.startDate, trip.endDate, [trip.userId]);
  await notify(trip.userId, `Dinas luar ${trip.destination} ${approve ? "disetujui" : "ditolak"}`,
    `${dateRange(trip.startDate, trip.endDate)} · ${decisionText(approve, a.name, note)}`, "/portal/dinas");
  refresh();
  return {};
}
