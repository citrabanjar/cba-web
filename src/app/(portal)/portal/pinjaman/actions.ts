"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isPeriod } from "@/lib/loans";
import { nextLoanNo } from "@/lib/loan-view";
import { activeManager, loanAdmins, topLeaderOf } from "@/lib/loan-flow";
import { workflowSteps } from "@/lib/workflow-settings";
import { loanStepIds, type LoanFlow } from "@/lib/loans";
import { notify } from "@/lib/notify";
import { formatRupiah } from "@/lib/utils";

const PATH = "/portal/pinjaman";

// Karyawan mengajukan pinjaman → atasan langsung → pemeriksaan Admin → keputusan pimpinan puncak (lib/loan-flow.ts).
export async function requestLoan(input: { amount: number; tenor: number; startPeriod: string; purpose: string }) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Sesi tidak valid, silakan login ulang." };
  const amount = Math.round(Number(input.amount) || 0);
  const tenor = Math.round(Number(input.tenor) || 0);
  if (amount < 1000) return { error: "Jumlah pinjaman wajib diisi." };
  if (tenor < 1 || tenor > 120) return { error: "Jumlah angsuran 1-120 kali." };
  if (!isPeriod(input.startPeriod)) return { error: "Pilih periode potongan pertama." };
  if (!input.purpose.trim()) return { error: "Keperluan wajib diisi." };
  const pending = await prisma.employeeLoan.count({ where: { userId: session.user.id, status: "PENDING" } });
  if (pending) return { error: "Masih ada pengajuan yang menunggu persetujuan." };
  // Menu Workflow modul Pinjaman (bila aktif) menggantikan atasan langsung & pimpinan puncak:
  // level sebelum terakhir memutus dulu, lalu pemeriksaan Admin, lalu level terakhir memutus.
  const wf = await workflowSteps("PINJAMAN", session.user.id);
  if (wf.error) return { error: wf.error };
  let flow: LoanFlow, stage: string;
  if (wf.flow) {
    const steps = wf.flow.steps, last = steps[steps.length - 1];
    const pre = steps.slice(0, -1).map((x) => ({ id: x.id, ...(x.ids?.length ? { ids: x.ids } : {}), name: x.name, decision: "" as const, at: "", note: "" }));
    const topIds = loanStepIds(last);
    flow = { workflow: true, pre, topId: last.id, topIds, topName: last.name, who: [...new Set([...pre.flatMap(loanStepIds), ...topIds])] };
    stage = pre.length ? "ATASAN" : "ADMIN";
  } else {
    const manager = await activeManager(session.user.id);
    if (!manager) return { error: "Atasan langsung Anda belum diatur atau sudah tidak aktif, jadi pengajuan belum bisa dikirim. Hubungi HRD." };
    const top = (await topLeaderOf(session.user.id)) ?? manager;
    flow = { managerId: manager.id, managerName: manager.name, topId: top.id, topName: top.name, who: [manager.id, top.id] };
    stage = "ATASAN";
  }
  await prisma.employeeLoan.create({
    data: {
      userId: session.user.id, seqNo: await nextLoanNo(session.user.id), principal: amount, tenor, startPeriod: input.startPeriod,
      purpose: input.purpose.trim().slice(0, 500), createdBy: session.user.name ?? null, stage, flow,
    },
  });
  const what = `${session.user.name ?? ""} · ${formatRupiah(amount)} · ${tenor} kali angsuran.`;
  if (stage === "ATASAN") {
    await notify(flow.pre ? loanStepIds(flow.pre[0]) : [flow.managerId], "Pengajuan pinjaman baru", `${what} Menunggu persetujuan Anda.`, "/portal/notifikasi?modul=pinjaman");
  } else {
    // Workflow satu level: langsung ke pemeriksaan Admin; penyetuju mendapat kabar.
    await notify(await loanAdmins(), "Pengajuan pinjaman perlu diperiksa", `${what} Periksa dokumen fisik lalu kirim ke pimpinan.`, "/portal/admin/pinjaman");
    await notify(flow.topIds ?? [], "Pengajuan pinjaman dalam pemeriksaan Admin", `${what} Keputusan dapat diberikan setelah Admin selesai memeriksa.`, "/portal/notifikasi?modul=pinjaman");
  }
  revalidatePath(PATH);
  revalidatePath("/portal/admin/pinjaman");
  revalidatePath("/portal/dashboard");
  revalidatePath("/portal/notifikasi");
  return {};
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
