"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getReimburseSettings, quoteClaim, reimburseRefresh, submitClaimFor, type ClaimUpload } from "@/lib/reimburse";
import { FILE_KINDS, type FileKind } from "@/lib/reimburse-shared";

// Kirim pengajuan: isian + lampiran (FormData, berkas "file_<KIND>_<n>").
export async function submitClaim(form: FormData) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Sesi tidak valid, silakan login ulang." };
  const files: ClaimUpload[] = [];
  for (const [key, value] of form.entries()) {
    if (!key.startsWith("file_") || !(value instanceof File) || !value.size) continue;
    const kind = key.split("_").slice(1, -1).join("_") as FileKind;
    if (!FILE_KINDS.some((k) => k.key === kind)) continue;
    files.push({ kind, name: value.name || kind, mime: value.type, data: Buffer.from(await value.arrayBuffer()) });
  }
  return submitClaimFor({ id: session.user.id, name: session.user.name ?? null }, {
    treatDate: String(form.get("treatDate") ?? ""), provider: String(form.get("provider") ?? ""),
    amount: Number(form.get("amount") ?? 0), note: String(form.get("note") ?? ""),
  }, files);
}

// Perkiraan pembayaran & sisa plafon (tampil saat mengisi).
export async function previewClaim(treatDate: string, amount: number) {
  const session = await auth();
  if (!session?.user?.id || !/^\d{4}-\d{2}-\d{2}$/.test(treatDate)) return null;
  const s = await getReimburseSettings();
  const q = await quoteClaim(session.user.id, Number(amount) || 0, new Date(`${treatDate}T00:00:00Z`), s);
  return { payout: q.payout, cap: q.cap, used: q.used, remaining: q.remaining };
}

export async function cancelClaim(id: string) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Sesi tidak valid." };
  const c = await prisma.medicalClaim.findUnique({ where: { id } });
  if (!c || c.userId !== session.user.id) return { error: "Data tidak ditemukan." };
  if (c.status !== "PENDING") return { error: "Hanya pengajuan yang menunggu persetujuan yang bisa dibatalkan." };
  await prisma.medicalClaim.update({ where: { id }, data: { status: "CANCELLED" } });
  reimburseRefresh();
  return {};
}
