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
import { loanPreStep, loanTurn, readLoanFlow } from "@/lib/loans";
import { applyPlan, loanReviewers, planLoan } from "@/lib/loan-flow";
import { formatRupiah } from "@/lib/utils";

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
  for (const p of ["/portal/persetujuan", "/portal/notifikasi", "/portal/cuti", "/portal/dinas", "/portal/dashboard", "/portal/admin/leave"]) revalidatePath(p);
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
  // Delegasi tanggung jawab: pengajuan baru untuk pemohon dialihkan ke delegasi selama tanggal cuti.
  if (approve && req.delegateId) {
    const who = await prisma.user.findUnique({ where: { id: req.userId }, select: { name: true } });
    await notify(req.delegateId, "Anda menjadi delegasi tanggung jawab",
      `${who?.name ?? ""} cuti ${dateRange(req.startDate, req.endDate)}. Pengajuan baru yang biasanya ia putuskan akan masuk ke Anda selama tanggal itu.`, "/portal/notifikasi");
  }
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

// Pengajuan lembur karyawan (bila SPL tidak dipakai): atasan langsung / Workflow modul Lembur.
export async function decideOvertime(id: string, approve: boolean, note: string): Promise<Result> {
  const a = await approver();
  const o = await prisma.overtime.findUnique({ where: { id } });
  if (!o || o.status !== "PENDING") return { error: "Pengajuan tidak ditemukan atau sudah diputus." };
  if (!approve && !note.trim()) return { error: "Tulis alasan penolakan." };
  const wf = workflowDecision(o.approval, a.id, approve, note, a.name);
  if (wf && "error" in wf) return { error: wf.error };
  if (wf && !wf.rejected && !wf.done) {
    await prisma.overtime.update({ where: { id }, data: { approval: wf.approval } });
    refresh();
    revalidatePath("/portal/lembur");
    return {};
  }
  if (!wf && !(await canDecide(a, o.userId))) return { error: "Anda bukan penyetuju pengajuan ini." };
  await prisma.overtime.update({
    where: { id },
    data: { status: approve ? "APPROVED" : "REJECTED", decidedBy: a.name, decidedAt: new Date(), note: note.trim() || null, ...(wf ? { approval: wf.approval } : {}) },
  });
  await notify(o.userId, `Pengajuan lembur ${approve ? "disetujui" : "ditolak"}`,
    `${dateRange(o.date, o.date)} · ${o.startTime}–${o.endTime} · ${decisionText(approve, a.name, note)}`, "/portal/lembur");
  refresh();
  revalidatePath("/portal/lembur");
  return {};
}

// Pengajuan pinjaman karyawan (lib/loan-flow.ts): atasan langsung memutus di tahap ATASAN, pimpinan puncak di tahap PIMPINAN
// (setelah Admin selesai memeriksa dokumen fisik). Alasan wajib saat menolak.
export async function decideLoan(id: string, approve: boolean, note: string): Promise<Result> {
  const a = await approver();
  const loan = await prisma.employeeLoan.findUnique({ where: { id }, include: { user: { select: { name: true } } } });
  if (!loan || loan.status !== "PENDING") return { error: "Pengajuan tidak ditemukan atau sudah diputus." };
  if (!approve && !note.trim()) return { error: "Tulis alasan penolakan." };
  const flow = readLoanFlow(loan.flow);
  const now = new Date().toISOString();
  const amount = formatRupiah(loan.principal);
  const done = () => {
    refresh();
    for (const p of ["/portal/pinjaman", "/portal/admin/pinjaman", `/portal/admin/karyawan/${loan.userId}`]) revalidatePath(p);
    return {};
  };

  if (loan.stage === "ATASAN") {
    if (!loanTurn(loan.status, loan.stage, flow, a.id)) return { error: "Belum giliran Anda memutus, atau Anda bukan penyetuju pengajuan ini." };
    // Jejak keputusan: level Workflow (pre) atau atasan langsung.
    const step = loanPreStep(flow);
    const next: typeof flow = step
      ? { ...flow, pre: flow.pre!.map((x) => (x === step ? { ...x, decision: approve ? "SETUJU" : "TOLAK", at: now, note: note.trim(), by: a.name ?? "", ...(x.ids?.length ? { id: a.id } : {}) } : x)) }
      : { ...flow, managerAt: now, managerNote: note.trim() };
    if (!approve) {
      await prisma.employeeLoan.update({ where: { id }, data: { status: "DITOLAK", stage: null, note: note.trim(), approvedBy: a.name, approvedAt: new Date(), flow: next } });
      await notify(loan.userId, "Pengajuan pinjaman ditolak", `${amount} · ${decisionText(false, a.name, note)}`, "/portal/pinjaman");
      return done();
    }
    const following = loanPreStep(next);
    if (following) {
      // Level Workflow berikutnya (sebelum pemeriksaan Admin).
      await prisma.employeeLoan.update({ where: { id }, data: { flow: next } });
      return done();
    }
    await prisma.employeeLoan.update({ where: { id }, data: { stage: "ADMIN", flow: next } });
    await notify(loan.userId, "Pengajuan pinjaman disetujui atasan", `${amount} · Disetujui oleh ${a.name ?? "atasan"}. Siapkan dokumen fisik untuk diperiksa ${flow.checkName ?? "Admin"}.`, "/portal/pinjaman");
    // Pimpinan melihat kartunya di "Sedang diproses" selama pemeriksaan (tanpa notifikasi ganda).
    return done();
  }

  if (loan.stage === "PIMPINAN") {
    if (!loanTurn(loan.status, loan.stage, flow, a.id)) return { error: "Anda bukan penyetuju pengajuan ini." };
    const admins = [flow.adminId, ...(await loanReviewers(flow))];
    if (!approve) {
      await prisma.employeeLoan.update({
        where: { id }, data: { status: "DITOLAK", stage: null, note: note.trim(), approvedBy: a.name, approvedAt: new Date(), flow: { ...flow, topAt: now, topNote: note.trim(), topBy: a.name ?? "" } },
      });
      await notify(loan.userId, "Pengajuan pinjaman ditolak", `${amount} · ${decisionText(false, a.name, note)}`, "/portal/pinjaman");
      await notify(admins, "Pengajuan pinjaman ditolak pimpinan", `${loan.user.name} · ${amount} · ${decisionText(false, a.name, note)}`, "/portal/admin/pinjaman");
      return done();
    }
    if (!flow.plan) return { error: "Rencana angsuran dari Admin tidak ditemukan." };
    const p = await planLoan(loan, flow.plan, true);
    if ("error" in p) return { error: p.error };
    await applyPlan(loan, p, a.name, { flow: { ...flow, topAt: now, topNote: note.trim(), topBy: a.name ?? "" } }, flow.adminNote ?? "");
    await notify(loan.userId, "Pengajuan pinjaman disetujui",
      `${formatRupiah(p.total)} · ${p.rows.length} kali angsuran mulai ${p.plan.startPeriod} · Disetujui oleh ${a.name ?? "pimpinan"}. Menunggu pencairan.`, "/portal/pinjaman");
    await notify(admins, "Pengajuan pinjaman disetujui pimpinan", `${loan.user.name} · ${formatRupiah(p.total)} · Silakan cairkan lalu tandai Dicairkan.`, "/portal/admin/pinjaman");
    return done();
  }
  return { error: "Pengajuan ini sedang diperiksa Admin; keputusan dapat diberikan setelah pemeriksaan selesai." };
}
