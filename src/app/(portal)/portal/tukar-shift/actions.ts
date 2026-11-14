"use server";

import { revalidatePath } from "next/cache";
import { dateRange, decisionText, notify } from "@/lib/notify";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { OPEN_SWAP, activeManager, applySwap, hasAttendance, periodFinal, swapShifts } from "@/lib/shift-swap";

type Result = { error?: string };
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ATT = "Salah satu karyawan sudah check-in/check-out di tanggal itu, tukar shift tidak bisa lagi.";

async function me() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  return { id: session.user.id, name: session.user.name ?? null };
}
function refresh() {
  for (const p of ["/portal/tukar-shift", "/portal/persetujuan", "/portal/dashboard", "/portal/profil", "/portal/admin/schedule"]) revalidatePath(p);
  revalidatePath("/portal/admin/karyawan", "layout");
}

// Pratinjau: shift saya dan shift rekan di tanggal itu, plus kendala bila ada.
export async function previewSwap(date: string, partnerId: string) {
  const u = await me();
  if (!DATE.test(date) || !partnerId) return { error: "Pilih tanggal dan rekan." };
  const d = new Date(`${date}T00:00:00Z`);
  const s = await swapShifts(u.id, partnerId, d);
  return {
    mine: "error" in s.a ? null : { code: s.a.code, name: s.a.name },
    theirs: "error" in s.b ? null : { code: s.b.code, name: s.b.name },
    error: "error" in s.a ? `Jadwal Anda: ${s.a.error}.` : "error" in s.b ? `Jadwal rekan: ${s.b.error}.` : s.a.code === s.b.code ? "Shift Anda dan rekan sama, tidak perlu ditukar." : undefined,
  };
}

export async function submitSwap(input: { date: string; partnerId: string; reason: string }): Promise<Result> {
  const u = await me();
  if (!DATE.test(input.date) || !input.partnerId) return { error: "Pilih tanggal dan rekan." };
  if (input.partnerId === u.id) return { error: "Pilih rekan lain." };
  const date = new Date(`${input.date}T00:00:00Z`);
  const partner = await prisma.user.findUnique({ where: { id: input.partnerId }, select: { isActive: true } });
  if (!partner?.isActive) return { error: "Rekan tidak ditemukan atau tidak aktif." };
  if (!(await activeManager(u.id))) return { error: "Atasan langsung Anda belum diatur atau sudah tidak aktif. Hubungi HRD." };
  if (!(await activeManager(input.partnerId))) return { error: "Atasan langsung rekan belum diatur atau sudah tidak aktif. Hubungi HRD." };
  if (await periodFinal(date)) return { error: "Periode gaji bulan itu sudah final." };
  if (await hasAttendance([u.id, input.partnerId], date)) return { error: ATT };
  const s = await swapShifts(u.id, input.partnerId, date);
  if ("error" in s.a) return { error: `Jadwal Anda: ${s.a.error}.` };
  if ("error" in s.b) return { error: `Jadwal rekan: ${s.b.error}.` };
  if (s.a.code === s.b.code) return { error: "Shift Anda dan rekan sama, tidak perlu ditukar." };
  const busy = await prisma.shiftSwapRequest.findFirst({
    where: { date, status: { in: OPEN_SWAP }, OR: [{ requesterId: { in: [u.id, input.partnerId] } }, { partnerId: { in: [u.id, input.partnerId] } }] },
  });
  if (busy) return { error: "Sudah ada pengajuan tukar shift yang berjalan di tanggal itu untuk Anda atau rekan." };
  await prisma.shiftSwapRequest.create({
    data: { requesterId: u.id, partnerId: input.partnerId, date, requesterShift: s.a.code, partnerShift: s.b.code, reason: input.reason.trim() || null },
  });
  refresh();
  return {};
}

// Rekan menerima / menolak. Diterima → diteruskan ke atasan langsung kedua karyawan.
export async function respondSwap(id: string, accept: boolean, note: string): Promise<Result> {
  const u = await me();
  const r = await prisma.shiftSwapRequest.findUnique({ where: { id } });
  if (!r || r.partnerId !== u.id || r.status !== "MENUNGGU_REKAN") return { error: "Pengajuan tidak ditemukan atau sudah diproses." };
  if (!accept) {
    await prisma.shiftSwapRequest.update({ where: { id }, data: { status: "DITOLAK", note: note.trim() || "Ditolak rekan", decidedBy: u.name, decidedAt: new Date() } });
    await notify(r.requesterId, "Tukar shift ditolak rekan", `${dateRange(r.date, r.date)} · ${decisionText(false, u.name, note)}`, "/portal/tukar-shift");
    refresh();
    return {};
  }
  if (await hasAttendance([r.requesterId, r.partnerId], r.date)) return { error: ATT };
  const [ma, mb] = await Promise.all([activeManager(r.requesterId), activeManager(r.partnerId)]);
  if (!ma || !mb) return { error: "Atasan langsung salah satu karyawan belum diatur. Hubungi HRD." };
  await prisma.shiftSwapRequest.update({
    where: { id },
    data: { status: "MENUNGGU_ATASAN", partnerAt: new Date(), managerAId: ma, managerBId: mb === ma ? null : mb },
  });
  refresh();
  return {};
}

export async function cancelSwap(id: string): Promise<Result> {
  const u = await me();
  const r = await prisma.shiftSwapRequest.findUnique({ where: { id } });
  if (!r || r.requesterId !== u.id || !OPEN_SWAP.includes(r.status)) return { error: "Pengajuan tidak bisa dibatalkan." };
  await prisma.shiftSwapRequest.update({ where: { id }, data: { status: "DIBATALKAN" } });
  refresh();
  return {};
}

// Atasan langsung pemohon / rekan menyetujui atau menolak. Setelah semua atasan setuju, shift ditukar.
export async function decideSwap(id: string, approve: boolean, note: string): Promise<Result> {
  const u = await me();
  const r = await prisma.shiftSwapRequest.findUnique({ where: { id } });
  if (!r || r.status !== "MENUNGGU_ATASAN") return { error: "Pengajuan tidak ditemukan atau sudah diputus." };
  const isA = r.managerAId === u.id && !r.managerAAt;
  const isB = r.managerBId === u.id && !r.managerBAt;
  if (!isA && !isB) return { error: "Anda bukan penyetuju pengajuan ini." };
  if (!approve) {
    if (!note.trim()) return { error: "Tulis alasan penolakan." };
    await prisma.shiftSwapRequest.update({ where: { id }, data: { status: "DITOLAK", note: note.trim(), decidedBy: u.name, decidedAt: new Date() } });
    await notify([r.requesterId, r.partnerId], "Tukar shift ditolak", `${dateRange(r.date, r.date)} · ${decisionText(false, u.name, note)}`, "/portal/tukar-shift");
    refresh();
    return {};
  }
  if (await hasAttendance([r.requesterId, r.partnerId], r.date)) return { error: ATT };
  if (await periodFinal(r.date)) return { error: "Periode gaji bulan itu sudah final." };
  const now = new Date();
  const data = { ...(isA ? { managerAAt: now, managerAName: u.name } : {}), ...(isB ? { managerBAt: now, managerBName: u.name } : {}) };
  const doneA = isA || !!r.managerAAt;
  const doneB = !r.managerBId || isB || !!r.managerBAt;
  if (doneA && doneB) {
    const res = await applySwap(r, u.name);
    if (res.error) return { error: res.error };
    await prisma.shiftSwapRequest.update({ where: { id }, data: { ...data, status: "DISETUJUI", note: note.trim() || null, decidedBy: u.name, decidedAt: now } });
    await notify([r.requesterId, r.partnerId], "Tukar shift disetujui", `${dateRange(r.date, r.date)} · ${decisionText(true, u.name)} Shift sudah ditukar.`, "/portal/tukar-shift");
  } else {
    await prisma.shiftSwapRequest.update({ where: { id }, data });
  }
  refresh();
  return {};
}
