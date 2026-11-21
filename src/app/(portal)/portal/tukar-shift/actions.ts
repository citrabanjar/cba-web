"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { submitSwapFor, type SwapInput } from "@/lib/request-submit";
import { prisma } from "@/lib/prisma";
import { OPEN_SWAP, swapShifts } from "@/lib/shift-swap";
import { decideSwapAs, respondSwapAs } from "@/lib/decide-requests";

type Result = { error?: string };
const DATE = /^\d{4}-\d{2}-\d{2}$/;

async function me() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  return { id: session.user.id, name: session.user.name ?? null };
}
function refresh() {
  for (const p of ["/portal/tukar-shift", "/portal/persetujuan", "/portal/notifikasi", "/portal/dashboard", "/portal/profil", "/portal/admin/schedule"]) revalidatePath(p);
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

export async function submitSwap(input: SwapInput): Promise<Result> {
  return submitSwapFor(await me(), input);
}

// Rekan menerima / menolak; atasan memutus. Logika di lib/decide-requests (dipakai juga tombol Telegram).
export async function respondSwap(id: string, accept: boolean, note: string): Promise<Result> {
  return respondSwapAs({ ...(await me()), role: "" }, id, accept, note);
}

export async function cancelSwap(id: string): Promise<Result> {
  const u = await me();
  const r = await prisma.shiftSwapRequest.findUnique({ where: { id } });
  if (!r || r.requesterId !== u.id || !OPEN_SWAP.includes(r.status)) return { error: "Pengajuan tidak bisa dibatalkan." };
  await prisma.shiftSwapRequest.update({ where: { id }, data: { status: "DIBATALKAN" } });
  refresh();
  return {};
}

export async function decideSwap(id: string, approve: boolean, note: string): Promise<Result> {
  return decideSwapAs({ ...(await me()), role: "" }, id, approve, note);
}
