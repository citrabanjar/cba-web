"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getAccess } from "@/lib/access";
import { canDecide } from "@/lib/approval";
import { decideStep, notifyInfo } from "@/lib/workflow-settings";
import { readApproval } from "@/lib/onboarding-interview";
import { dateRange, decisionText, notify } from "@/lib/notify";
import { loanPreStep, loanTurn, readLoanFlow } from "@/lib/loans";
import { applyPlan, loanReviewers, planLoan } from "@/lib/loan-flow";
import { formatRupiah } from "@/lib/utils";
import { finalPayout, reimburseRefresh } from "@/lib/reimburse";
import { decideFixAs, decideLeaveAs, decideOvertimeAs, decideTripAs } from "@/lib/decide-requests";

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

// Setujui / tolak Cuti, Dinas Luar, Lembur, Lupa Absen: logikanya di lib/decide-requests (dipakai juga oleh Telegram).
export async function decideLeave(id: string, approve: boolean, note: string): Promise<Result> {
  return decideLeaveAs(await approver(), id, approve, note);
}
export async function decideTrip(id: string, approve: boolean, note: string): Promise<Result> {
  return decideTripAs(await approver(), id, approve, note);
}
export async function decideOvertime(id: string, approve: boolean, note: string): Promise<Result> {
  return decideOvertimeAs(await approver(), id, approve, note);
}
export async function decideFix(id: string, approve: boolean, note: string): Promise<Result> {
  return decideFixAs(await approver(), id, approve, note);
}

// Reimbursement pengobatan: atasan langsung / Workflow modul Reimbursement. Disetujui level terakhir → dibayar di
// Proses Gaji berikutnya (pembayaran dihitung ulang terhadap sisa plafon terbaru).
export async function decideClaim(id: string, approve: boolean, note: string): Promise<Result> {
  const a = await approver();
  const c = await prisma.medicalClaim.findUnique({ where: { id } });
  if (!c || c.status !== "PENDING") return { error: "Pengajuan tidak ditemukan atau sudah diputus." };
  if (!approve && !note.trim()) return { error: "Tulis alasan penolakan." };
  const wf = workflowDecision(c.approval, a.id, approve, note, a.name);
  if (wf && "error" in wf) return { error: wf.error };
  if (wf && !wf.rejected && !wf.done) {
    await prisma.medicalClaim.update({ where: { id }, data: { approval: wf.approval } });
    reimburseRefresh();
    return {};
  }
  if (!wf && !(await canDecide(a, c.userId))) return { error: "Anda bukan penyetuju pengajuan ini." };
  const payout = approve ? await finalPayout(id) : c.payout;
  if (approve && payout <= 0) return { error: "Plafon reimbursement karyawan ini sudah habis." };
  await prisma.medicalClaim.update({
    where: { id },
    data: { status: approve ? "APPROVED" : "REJECTED", payout, decidedBy: a.name, decidedAt: new Date(), decision: note.trim() || null, ...(wf ? { approval: wf.approval } : {}) },
  });
  if (approve && wf) {
    const who = await prisma.user.findUnique({ where: { id: c.userId }, select: { name: true } });
    await notifyInfo(wf.approval, `Info: ${who?.name ?? "Karyawan"} reimbursement`, `${dateRange(c.treatDate, c.treatDate)} · ${c.provider} · Rp ${Math.round(payout).toLocaleString("id-ID")} · disetujui ${a.name ?? ""}`.trim());
  }
  await notify(c.userId, `Reimbursement ${approve ? "disetujui" : "ditolak"}`,
    `${dateRange(c.treatDate, c.treatDate)} · ${c.provider} · ${approve ? `Rp ${Math.round(payout).toLocaleString("id-ID")} dibayarkan bersama gaji berikutnya` : ""} · ${decisionText(approve, a.name, note)}`, "/portal/reimburse");
  reimburseRefresh();
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
    await notify(admins, "Pengajuan pinjaman disetujui pimpinan", `${loan.user.name} · ${formatRupiah(p.total)} · Silakan buat File Transfer di menu Pinjaman Karyawan.`, "/portal/admin/pinjaman");
    return done();
  }
  return { error: "Pengajuan ini sedang diperiksa Admin; keputusan dapat diberikan setelah pemeriksaan selesai." };
}
