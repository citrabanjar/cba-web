"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isPeriod } from "@/lib/loans";
import { nextLoanNo } from "@/lib/loan-view";
import { activeManager, planLoan, topLeaderOf } from "@/lib/loan-flow";
import type { EmployeeLoan } from "@prisma/client";
import { workflowSteps } from "@/lib/workflow-settings";
import { delegateLabel, delegateSteps, routeTo } from "@/lib/delegation";
import { loanStepIds, type LoanFlow } from "@/lib/loans";

const PATH = "/portal/pinjaman";

// Karyawan mengajukan pinjaman → atasan langsung → pemeriksaan Admin → keputusan pimpinan puncak (lib/loan-flow.ts).
// recalc: permohonan hitung ulang angsuran = pinjaman baru digabung dengan sisa pinjaman berjalan yang dipilih,
// dengan potongan per bulan (installment) atau jumlah angsuran (tenor) yang diminta. Keputusan akhir tetap di Admin & penyetuju.
export async function requestLoan(input: { amount: number; tenor: number; startPeriod: string; purpose: string; recalc?: { mergeIds: string[]; installment?: number } }) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Sesi tidak valid, silakan login ulang." };
  const amount = Math.round(Number(input.amount) || 0);
  let tenor = Math.round(Number(input.tenor) || 0);
  if (amount < 1000) return { error: "Jumlah pinjaman wajib diisi." };
  const each = Math.round(Number(input.recalc?.installment) || 0);
  if (!(input.recalc?.mergeIds.length && each > 0) && (tenor < 1 || tenor > 120)) return { error: "Jumlah angsuran 1-120 kali." };
  if (!isPeriod(input.startPeriod)) return { error: "Pilih periode potongan pertama." };
  if (!input.purpose.trim()) return { error: "Keperluan wajib diisi." };
  const pending = await prisma.employeeLoan.count({ where: { userId: session.user.id, status: "PENDING" } });
  if (pending) return { error: "Masih ada pengajuan yang menunggu persetujuan." };
  // Ringkasan bila masih ada pinjaman berjalan: potongan per bulan sebelum → sesudah (dan hitung ulang bila digabung).
  let request;
  if (await prisma.employeeLoan.count({ where: { userId: session.user.id, status: "BERJALAN" } })) {
    const mergeIds = input.recalc?.mergeIds ?? [];
    const p = await planLoan({ userId: session.user.id } as EmployeeLoan, { principal: amount, tenor, startPeriod: input.startPeriod, installment: mergeIds.length && each > 0 ? each : undefined, mergeIds }, true);
    if ("error" in p) return { error: p.error };
    request = p.plan;
    if (mergeIds.length) tenor = p.rows.length;
  }
  // Menu Workflow modul Pinjaman (bila aktif) menggantikan jalur normal sepenuhnya:
  // level sebelum Pemeriksa dokumen memutus dulu → level Pemeriksa dokumen memeriksa & menyusun angsuran → level terakhir memutus.
  const wf = await workflowSteps("PINJAMAN", session.user.id);
  if (wf.error) return { error: wf.error };
  let flow: LoanFlow, stage: string;
  if (wf.flow) {
    const raw = wf.flow.steps, last = raw[raw.length - 1];
    // Delegasi diterapkan ke langkah sebelum pemutus; pemutus dialihkan saat Admin mengirim hasil pemeriksaan.
    const steps = [...(await delegateSteps({ ...wf.flow, steps: raw.slice(0, -1) }, session.user.id)).steps, last];
    const ci = steps.findIndex((x) => x.check);
    if (ci === steps.length - 1) return { error: "Pemutus pinjaman pada Workflow tidak bisa memutus pengajuannya sendiri. Hubungi HRD." };
    const checker = ci >= 0 ? steps[ci] : null;
    const pre = steps.slice(0, ci >= 0 ? ci : -1).map((x) => ({ id: x.id, ...(x.ids?.length ? { ids: x.ids } : {}), name: x.name, decision: "" as const, at: "", note: "" }));
    const topIds = loanStepIds(last);
    const checkIds = checker ? loanStepIds(checker) : [];
    flow = {
      workflow: true, ...(request ? { request } : {}), pre, topId: last.id, topIds, topName: last.name,
      ...(checker ? { checkIds, checkName: checker.name } : {}), who: [...new Set([...pre.flatMap(loanStepIds), ...checkIds, ...topIds])],
    };
    stage = pre.length ? "ATASAN" : "ADMIN";
  } else {
    const manager = await activeManager(session.user.id);
    if (!manager) return { error: "Atasan langsung Anda belum diatur atau sudah tidak aktif, jadi pengajuan belum bisa dikirim. Hubungi HRD." };
    const top = (await topLeaderOf(session.user.id)) ?? manager;
    // Atasan langsung = pimpinan puncak: tahap atasan dilewati, langsung ke pemeriksaan Admin; pimpinan memutus setelahnya.
    const skip = manager.id === top.id;
    const m = await routeTo(manager, session.user.id);
    flow = { ...(request ? { request } : {}), ...(skip ? {} : { managerId: m.id, managerName: delegateLabel(m) }), topId: top.id, topName: top.name, who: [m.id, top.id] };
    stage = skip ? "ADMIN" : "ATASAN";
  }
  await prisma.employeeLoan.create({
    data: {
      userId: session.user.id, seqNo: await nextLoanNo(session.user.id), principal: amount, tenor, startPeriod: input.startPeriod,
      purpose: input.purpose.trim().slice(0, 500), createdBy: session.user.name ?? null, stage, flow,
    },
  });
  // Penyetuju yang mendapat giliran cukup melihat kartu "Menunggu keputusan Anda" (tanpa notifikasi ganda, sama seperti cuti).
  // Pemeriksa dan pimpinan cukup melihat kartu pengajuan di Notifikasi → Pinjaman (tanpa notifikasi ganda).
  revalidatePath(PATH);
  revalidatePath("/portal/admin/pinjaman");
  revalidatePath("/portal/dashboard");
  revalidatePath("/portal/notifikasi");
  // Nama penyetuju pertama untuk pemberitahuan "diajukan ke … untuk approval".
  const first = stage === "ATASAN" ? (flow.pre?.[0]?.name ?? flow.managerName ?? "atasan langsung") : flow.checkName ?? "Admin";
  return { proposed: first };
}

export async function cancelLoanRequest(id: string) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Sesi tidak valid." };
  const loan = await prisma.employeeLoan.findFirst({ where: { id, userId: session.user.id, status: "PENDING" } });
  if (!loan) return { error: "Pengajuan tidak ditemukan atau sudah diproses." };
  await prisma.employeeLoan.update({ where: { id }, data: { status: "BATAL" } });
  revalidatePath(PATH);
  revalidatePath("/portal/admin/pinjaman");
  return {};
}
