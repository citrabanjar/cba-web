"use server";

import { cancelSplOvertime, orgChart } from "@/lib/spl";
import { assignCheckers, verifyOvertime } from "@/lib/overtime-check";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { submitOvertimeFor, type OvertimeInput } from "@/lib/request-submit";
import { prisma } from "@/lib/prisma";
import { dinasOn } from "@/lib/overtime";
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
  // Bersedia pada SPL: daftar cek fisik ke security yang shiftnya beririsan dengan jam lembur.
  if (accept && o.orderId) await assignCheckers(o.id).catch(() => []);
  refresh();
  return {};
}

// Pengajuan lembur oleh karyawan (bila SPL tidak dipakai). Diputus atasan langsung / Workflow modul Lembur.
export async function submitOvertime(input: OvertimeInput): Promise<Result> {
  return submitOvertimeFor(await me(), input);
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

// Atasan langsung memutus laporan cek fisik: benar lembur (dibayar) atau tidak lembur (tidak dibayar).
export async function verifyTeamOvertime(id: string, benar: boolean, note: string): Promise<Result> {
  const u = await me();
  const r = await verifyOvertime(id, { id: u.id, name: u.name ?? "", canAdmin: false }, benar, note);
  if (!r.error) refresh();
  return r;
}
