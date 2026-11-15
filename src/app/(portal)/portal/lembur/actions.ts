"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { hasApprover } from "@/lib/approval";
import { workflowSteps } from "@/lib/workflow-settings";
import { dinasOn, isTime, plannedHours, splEnabled } from "@/lib/overtime";
import { formatDate } from "@/lib/utils";

type Result = { error?: string };

async function me() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Sesi tidak valid, silakan login ulang.");
  return { id: session.user.id, name: session.user.name ?? null };
}

function refresh() {
  for (const p of ["/portal/lembur", "/portal/persetujuan", "/portal/admin/lembur", "/portal/profil"]) revalidatePath(p);
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
export async function submitOvertime(input: { date: string; startTime: string; endTime: string; breakStart: string; breakEnd: string; reason: string }): Promise<Result> {
  const u = await me();
  if (await splEnabled()) return { error: "Lembur memakai Surat Perintah Lembur dari Admin; pengajuan sendiri tidak dipakai." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { error: "Tanggal lembur wajib diisi." };
  if (!isTime(input.startTime) || !isTime(input.endTime)) return { error: "Jam mulai dan jam selesai lembur wajib diisi." };
  if (input.startTime === input.endTime) return { error: "Jam selesai harus berbeda dengan jam mulai." };
  const hasBreak = !!(input.breakStart || input.breakEnd);
  if (hasBreak && (!isTime(input.breakStart) || !isTime(input.breakEnd))) return { error: "Isi jam istirahat lengkap (mulai dan selesai), atau kosongkan." };
  if (!input.reason.trim()) return { error: "Tulis keperluan lembur." };
  const date = new Date(`${input.date}T00:00:00Z`);
  const row = { date, startTime: input.startTime, endTime: input.endTime, breakStart: hasBreak ? input.breakStart : null, breakEnd: hasBreak ? input.breakEnd : null };
  if (plannedHours(row) < 1) return { error: "Lembur minimal 1 jam (di luar istirahat)." };
  const clash = await prisma.overtime.findFirst({ where: { userId: u.id, date, status: { in: ["PENDING", "APPROVED", "MENUNGGU_KARYAWAN", "DISETUJUI"] } } });
  if (clash) return { error: `Sudah ada lembur di ${formatDate(date)} (${clash.startTime}–${clash.endTime}).` };
  const dinas = (await dinasOn([u.id], date)).get(u.id);
  if (dinas) return { error: `Tanggal ${formatDate(date)} beririsan dengan ${dinas}; lembur tidak bisa diajukan saat dinas.` };
  const { flow, error } = await workflowSteps("LEMBUR", u.id);
  if (error) return { error };
  if (!flow && !(await hasApprover(u.id))) return { error: "Atasan langsung Anda belum diatur atau sudah tidak aktif, jadi pengajuan belum bisa dikirim. Hubungi HRD." };
  await prisma.overtime.create({
    data: { userId: u.id, ...row, reason: input.reason.trim(), status: "PENDING", createdBy: u.name, ...(flow ? { approval: flow } : {}) },
  });
  refresh();
  return {};
}

export async function cancelOvertime(id: string): Promise<Result> {
  const u = await me();
  const o = await prisma.overtime.findUnique({ where: { id } });
  if (!o || o.userId !== u.id || o.status !== "PENDING") return { error: "Hanya pengajuan yang menunggu persetujuan yang bisa dibatalkan." };
  await prisma.overtime.update({ where: { id }, data: { status: "CANCELLED" } });
  refresh();
  return {};
}
