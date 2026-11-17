"use server";

import { cancelSplOvertime, orgChart } from "@/lib/spl";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { firstApproverName, hasApprover } from "@/lib/approval";
import { workflowSteps } from "@/lib/workflow-settings";
import { withDelegation } from "@/lib/delegation";
import { dinasOn, isTime, otBreakText, plannedHours, restDaysOf, restKey, shiftConflicts, splEnabled } from "@/lib/overtime";
import { formatDate } from "@/lib/utils";

type Result = { error?: string; approver?: string };

async function me() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Sesi tidak valid, silakan login ulang.");
  return { id: session.user.id, name: session.user.name ?? null };
}

function refresh() {
  for (const p of ["/portal/lembur", "/portal/persetujuan", "/portal/notifikasi", "/portal/admin/lembur", "/portal/profil"]) revalidatePath(p);
}

// Karyawan menjawab SPL: Bersedia → jam lembur langsung tertempel di jadwalnya; Tidak bersedia → alasan wajib.
export async function respondSpl(id: string, accept: boolean, note: string): Promise<Result> {
  const u = await me();
  const o = await prisma.overtime.findUnique({ where: { id } });
  if (!o || o.userId !== u.id || o.status !== "MENUNGGU_KARYAWAN") return { error: "SPL tidak ditemukan atau sudah dijawab." };
  if (!accept && !note.trim()) return { error: "Tulis alasan tidak bersedia." };
  if (accept) {
    const dinas = (await dinasOn([u.id], o.date)).get(u.id);
    if (dinas) return { error: `Tanggal ${formatDate(o.date)} beririsan dengan ${dinas}; lembur tidak bisa dijalankan saat dinas. Pilih Tidak bersedia.` };
  }
  await prisma.overtime.update({
    where: { id },
    data: { status: accept ? "DISETUJUI" : "TIDAK_BERSEDIA", decidedBy: u.name, decidedAt: new Date(), note: note.trim() || null },
  });
  refresh();
  return {};
}

// Pengajuan lembur oleh karyawan (bila SPL tidak dipakai). Diputus atasan langsung / Workflow modul Lembur.
export async function submitOvertime(input: { date: string; startTime: string; endTime: string; reason: string }): Promise<Result> {
  const u = await me();
  if (await splEnabled()) return { error: "Lembur memakai Surat Perintah Lembur dari Admin; pengajuan sendiri tidak dipakai." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { error: "Tanggal lembur wajib diisi." };
  if (!isTime(input.startTime) || !isTime(input.endTime)) return { error: "Jam mulai dan jam selesai lembur wajib diisi." };
  if (input.startTime === input.endTime) return { error: "Jam selesai harus berbeda dengan jam mulai." };
  if (!input.reason.trim()) return { error: "Tulis keperluan lembur." };
  const date = new Date(`${input.date}T00:00:00Z`);
  // Istirahat lembur dipotong otomatis (hari kerja 18:00-19:00; hari libur juga 12:00-13:00) bila tercakup penuh.
  const row = { date, startTime: input.startTime, endTime: input.endTime, breakStart: null, breakEnd: null };
  const rest = (await restDaysOf([{ userId: u.id, date }])).has(restKey(u.id, date));
  if (plannedHours(row, rest) < 1) return { error: `Lembur minimal 1 jam (di luar istirahat ${otBreakText(rest)}).` };
  const conflict = (await shiftConflicts([u.id], date, input.startTime, input.endTime)).get(u.id);
  if (conflict) return { error: `Jam lembur bentrok dengan ${conflict}.` };
  const clash = await prisma.overtime.findFirst({ where: { userId: u.id, date, status: { in: ["PENDING", "APPROVED", "MENUNGGU_KARYAWAN", "DISETUJUI"] } } });
  if (clash) return { error: `Sudah ada lembur di ${formatDate(date)} (${clash.startTime}–${clash.endTime}).` };
  const dinas = (await dinasOn([u.id], date)).get(u.id);
  if (dinas) return { error: `Tanggal ${formatDate(date)} beririsan dengan ${dinas}; lembur tidak bisa diajukan saat dinas.` };
  const { flow: wfFlow, error } = await workflowSteps("LEMBUR", u.id);
  if (error) return { error };
  if (!wfFlow && !(await hasApprover(u.id))) return { error: "Atasan langsung Anda belum diatur atau sudah tidak aktif, jadi pengajuan belum bisa dikirim. Hubungi HRD." };
  // Penyetuju yang sedang cuti dengan delegasi → pengajuan baru dialihkan ke delegasinya.
  const flow = await withDelegation(wfFlow, u.id);
  await prisma.overtime.create({
    data: { userId: u.id, ...row, reason: input.reason.trim(), status: "PENDING", createdBy: u.name, ...(flow ? { approval: flow } : {}) },
  });
  refresh();
  return { approver: await firstApproverName(flow, u.id) };
}

export async function cancelOvertime(id: string): Promise<Result> {
  const u = await me();
  const o = await prisma.overtime.findUnique({ where: { id } });
  if (!o || o.userId !== u.id || o.status !== "PENDING") return { error: "Hanya pengajuan yang menunggu persetujuan yang bisa dibatalkan." };
  await prisma.overtime.update({ where: { id }, data: { status: "CANCELLED" } });
  refresh();
  return {};
}

// Atasan di atas atasan langsung (sampai pimpinan puncak) membatalkan lembur SPL karyawan di bawahnya.
export async function cancelTeamOvertime(id: string, reason: string): Promise<Result> {
  const u = await me();
  const o = await prisma.overtime.findUnique({ where: { id }, select: { userId: true } });
  if (!o) return { error: "Lembur tidak ditemukan." };
  const chain = (await orgChart()).chain(o.userId);
  if (chain.indexOf(u.id) < 1) return { error: "Pembatalan hanya oleh atasan di atas atasan langsung karyawan." };
  const r = await cancelSplOvertime(id, { id: u.id, name: u.name ?? "" }, reason);
  if (!r.error) refresh();
  return r;
}
