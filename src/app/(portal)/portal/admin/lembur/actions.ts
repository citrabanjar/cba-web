"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireMenu } from "@/lib/access";
import { dinasOn, isTime, nextSplNumber, plannedHours, splEnabled } from "@/lib/overtime";
import { notify } from "@/lib/notify";
import { formatDate } from "@/lib/utils";

type Result = { error?: string };

function refresh() {
  for (const p of ["/portal/admin/lembur", "/portal/lembur", "/portal/dashboard", "/portal/profil"]) revalidatePath(p);
  revalidatePath("/portal/admin/karyawan", "layout");
}

export type SplInput = { date: string; startTime: string; endTime: string; breakStart: string; breakEnd: string; note: string; userIds: string[] };

// Admin membuat SPL untuk beberapa karyawan pada satu tanggal. Karyawan mendapat notifikasi untuk menjawab.
export async function createSpl(input: SplInput): Promise<Result & { number?: string; skipped?: string[] }> {
  const admin = await requireMenu("absensi");
  if (!(await splEnabled())) return { error: "Fitur Surat Perintah Lembur belum dinyalakan Super Admin." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { error: "Tanggal lembur wajib diisi." };
  if (!isTime(input.startTime) || !isTime(input.endTime) || input.startTime === input.endTime) return { error: "Isi jam mulai dan jam selesai lembur." };
  const hasBreak = !!(input.breakStart || input.breakEnd);
  if (hasBreak && (!isTime(input.breakStart) || !isTime(input.breakEnd))) return { error: "Isi jam istirahat lengkap (mulai dan selesai), atau kosongkan." };
  const ids = [...new Set(input.userIds)].filter(Boolean);
  if (!ids.length) return { error: "Pilih minimal satu karyawan." };
  const date = new Date(`${input.date}T00:00:00Z`);
  const row = { date, startTime: input.startTime, endTime: input.endTime, breakStart: hasBreak ? input.breakStart : null, breakEnd: hasBreak ? input.breakEnd : null };
  if (plannedHours(row) < 1) return { error: "Lembur minimal 1 jam (di luar istirahat)." };

  const users = await prisma.user.findMany({ where: { id: { in: ids }, isActive: true, role: { not: "SUPER_ADMIN" } }, select: { id: true, name: true } });
  // Karyawan yang sudah punya lembur aktif di tanggal itu dilewati.
  const busy = new Set((await prisma.overtime.findMany({
    where: { userId: { in: users.map((u) => u.id) }, date, status: { in: ["PENDING", "APPROVED", "MENUNGGU_KARYAWAN", "DISETUJUI"] } }, select: { userId: true },
  })).map((o) => o.userId));
  // Karyawan yang sedang dinas luar di tanggal itu tidak boleh diberi SPL.
  const dinas = await dinasOn(users.map((u) => u.id), date);
  const onTrip = users.filter((u) => dinas.has(u.id));
  if (onTrip.length) return { error: `Tidak bisa membuat SPL: ${onTrip.map((u) => `${u.name} (${dinas.get(u.id)})`).join(", ")} di ${formatDate(date)}. Hapus dari daftar karyawan.` };
  const targets = users.filter((u) => !busy.has(u.id));
  if (!targets.length) return { error: "Semua karyawan yang dipilih sudah punya lembur di tanggal itu." };

  const number = await nextSplNumber(date);
  await prisma.overtimeOrder.create({
    data: {
      number, ...row, note: input.note.trim() || null, createdBy: admin.name,
      items: { create: targets.map((u) => ({ userId: u.id, ...row, reason: input.note.trim() || null, status: "MENUNGGU_KARYAWAN", createdBy: admin.name })) },
    },
  });
  const brk = row.breakStart ? ` · istirahat ${row.breakStart}–${row.breakEnd}` : "";
  await notify(targets.map((u) => u.id), `Surat Perintah Lembur ${number}`,
    `${formatDate(date)} · ${row.startTime}–${row.endTime}${brk}. Pilih Bersedia atau Tidak bersedia.`, "/portal/lembur");
  refresh();
  return { number, skipped: users.filter((u) => busy.has(u.id)).map((u) => u.name) };
}

// Batalkan lembur satu karyawan dari SPL (belum dijalani).
export async function cancelSplItem(id: string): Promise<Result> {
  await requireMenu("absensi");
  const o = await prisma.overtime.findUnique({ where: { id }, include: { order: { select: { number: true } } } });
  if (!o || !o.orderId || !["MENUNGGU_KARYAWAN", "DISETUJUI"].includes(o.status)) return { error: "Lembur ini tidak bisa dibatalkan." };
  const att = await prisma.attendance.findFirst({ where: { userId: o.userId, date: o.date, checkOut: { not: null } } });
  if (att) return { error: "Karyawan sudah absen pulang di tanggal itu; lembur tidak bisa dibatalkan." };
  await prisma.overtime.update({ where: { id }, data: { status: "DIBATALKAN" } });
  await notify(o.userId, `Lembur ${o.order?.number ?? ""} dibatalkan`, `${formatDate(o.date)} · ${o.startTime}–${o.endTime}.`, "/portal/lembur");
  refresh();
  return {};
}

// Admin memutus revisi jam lembur (check-out melewati jam akhir SPL).
export async function decideRevision(id: string, approve: boolean, note: string): Promise<Result> {
  const admin = await requireMenu("absensi");
  const o = await prisma.overtime.findUnique({ where: { id } });
  if (!o || o.revisionStatus !== "MENUNGGU") return { error: "Revisi tidak ditemukan atau sudah diputus." };
  if (!approve && !note.trim()) return { error: "Tulis alasan penolakan." };
  await prisma.overtime.update({
    where: { id },
    data: { revisionStatus: approve ? "DISETUJUI" : "DITOLAK", revisionBy: admin.name, revisionAt: new Date(), note: note.trim() || o.note },
  });
  await notify(o.userId, `Revisi jam lembur ${approve ? "disetujui" : "ditolak"}`,
    `${formatDate(o.date)} · ${approve ? `lembur dihitung sampai ${o.revisionEnd}` : `lembur tetap dihitung sampai ${o.endTime}`}${!approve && note.trim() ? `: ${note.trim()}` : ""}.`, "/portal/lembur");
  refresh();
  return {};
}
