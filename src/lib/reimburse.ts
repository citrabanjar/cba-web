// Reimbursement Pengobatan (server). Aturan (keputusan pemilik 2026-11-19, angka diatur Admin Payroll):
// - Dibayar = persentase x nominal kuitansi, paling banyak sisa plafon tahun berjalan (pengajuan yang menunggu,
//   disetujui, dan sudah dibayar ikut memakai plafon).
// - Plafon diperbarui tiap 1 Januari atau tiap ulang tahun masa kerja; karyawan baru bisa prorata.
// - Lampiran kuitansi wajib, surat dokter sesuai parameter, resep bila ada.
// - Diputus atasan langsung / Workflow modul Reimbursement; yang disetujui dibayar di Proses Gaji berikutnya.
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { workflowSteps } from "@/lib/workflow-settings";
import { withDelegation } from "@/lib/delegation";
import { firstApproverName, hasApprover } from "@/lib/approval";
import { formatDate } from "@/lib/utils";
import { readReimburse, REIMBURSE_KEY, type FileKind, type ReimburseSettings } from "@/lib/reimburse-shared";

const DAY = 86_400_000;
const LIVE = ["PENDING", "APPROVED", "PAID"];
const MAX_TOTAL = 900_000; // batas total lampiran per pengajuan (byte); foto diperkecil di browser
const MIMES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const utcDate = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));
const round = (n: number) => Math.round(n);

export async function getReimburseSettings(): Promise<ReimburseSettings> {
  const row = await prisma.appSetting.findUnique({ where: { key: REIMBURSE_KEY } });
  return readReimburse(row?.value);
}

export function reimburseRefresh() {
  try {
    for (const p of ["/portal/reimburse", "/portal/persetujuan", "/portal/notifikasi", "/portal/dashboard", "/portal/admin/payroll"]) revalidatePath(p);
  } catch {
    // Di luar request Next (skrip uji): tidak ada cache yang perlu diperbarui.
  }
}

type Who = { employmentStatus: string | null; joinDate: Date | null };

// Rentang plafon yang memuat tanggal berobat, beserta besar plafonnya.
export function capWindow(user: Who, date: Date, s: ReimburseSettings) {
  const y = date.getUTCFullYear();
  let from = utcDate(y, 0, 1), to = utcDate(y, 11, 31);
  const join = user.joinDate;
  if (s.reset === "ULANG_TAHUN" && join) {
    let start = utcDate(y, join.getUTCMonth(), join.getUTCDate());
    if (start > date) start = utcDate(y - 1, join.getUTCMonth(), join.getUTCDate());
    from = start;
    to = new Date(utcDate(start.getUTCFullYear() + 1, start.getUTCMonth(), start.getUTCDate()).getTime() - DAY);
  }
  let cap = s.yearlyCap;
  // Prorata (reset 1 Januari): masuk di tahun berjalan → plafon x sisa bulan sejak bulan masuk / 12.
  if (cap > 0 && s.prorata && s.reset === "JANUARI" && join && join.getUTCFullYear() === y) cap = round((cap * (12 - join.getUTCMonth())) / 12);
  return { from, to, cap };
}

export async function usedInWindow(userId: string, from: Date, to: Date, excludeId?: string) {
  const r = await prisma.medicalClaim.aggregate({
    where: { userId, status: { in: LIVE }, treatDate: { gte: from, lte: to }, ...(excludeId ? { id: { not: excludeId } } : {}) },
    _sum: { payout: true },
  });
  return r._sum.payout ?? 0;
}

// Perkiraan pembayaran untuk nominal kuitansi pada tanggal berobat.
export async function quoteClaim(userId: string, amount: number, date: Date, s: ReimburseSettings, excludeId?: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { employmentStatus: true, joinDate: true } });
  const w = capWindow(user ?? { employmentStatus: null, joinDate: null }, date, s);
  const used = await usedInWindow(userId, w.from, w.to, excludeId);
  const remaining = w.cap > 0 ? Math.max(0, w.cap - used) : Infinity;
  const raw = round((amount * s.percent) / 100);
  return { payout: Math.min(raw, remaining), raw, cap: w.cap, used, remaining: Number.isFinite(remaining) ? remaining : null, from: w.from, to: w.to };
}

// Syarat berhak (status kerja & masa kerja). Pesan error bila tidak berhak.
export function eligibility(user: Who, date: Date, s: ReimburseSettings) {
  if (s.forStatus !== "SEMUA" && user.employmentStatus !== s.forStatus) return `Reimbursement pengobatan hanya untuk karyawan ${s.forStatus === "TETAP" ? "tetap" : "kontrak"}.`;
  if (s.minServiceMonths > 0) {
    const j = user.joinDate;
    const months = j ? (date.getUTCFullYear() - j.getUTCFullYear()) * 12 + date.getUTCMonth() - j.getUTCMonth() - (date.getUTCDate() < j.getUTCDate() ? 1 : 0) : 0;
    if (!j || months < s.minServiceMonths) return `Reimbursement pengobatan berlaku setelah masa kerja ${s.minServiceMonths} bulan.`;
  }
  return null;
}

export type ClaimInput = { treatDate: string; provider: string; amount: number; note: string };
export type ClaimUpload = { kind: FileKind; name: string; mime: string; data: Buffer };

export async function submitClaimFor(u: { id: string; name: string | null }, input: ClaimInput, files: ClaimUpload[]): Promise<{ error?: string; approver?: string; payout?: number }> {
  const s = await getReimburseSettings();
  if (!s.enabled) return { error: "Reimbursement pengobatan belum diaktifkan perusahaan." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.treatDate)) return { error: "Isi tanggal berobat." };
  const date = new Date(`${input.treatDate}T00:00:00Z`);
  const today = new Date(new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10) + "T00:00:00Z");
  if (date > today) return { error: "Tanggal berobat tidak boleh setelah hari ini." };
  if (s.deadlineDays > 0 && today.getTime() - date.getTime() > s.deadlineDays * DAY) return { error: `Pengajuan paling lambat ${s.deadlineDays} hari setelah tanggal berobat.` };
  if (!input.provider.trim()) return { error: "Isi nama klinik / rumah sakit / apotek." };
  const amount = round(Number(input.amount) || 0);
  if (amount < 1000) return { error: "Isi nominal kuitansi." };

  if (!files.some((f) => f.kind === "KUITANSI")) return { error: "Lampirkan foto kuitansi / nota klinik." };
  if (s.needDoctorLetter && !files.some((f) => f.kind === "SURAT_DOKTER")) return { error: "Lampirkan foto surat dokter." };
  if (files.some((f) => !MIMES.includes(f.mime))) return { error: "Lampiran harus berupa foto (JPG/PNG) atau PDF." };
  if (files.reduce((a, f) => a + f.data.length, 0) > MAX_TOTAL) return { error: "Ukuran lampiran terlalu besar. Gunakan foto, atau PDF yang lebih kecil." };

  const user = await prisma.user.findUnique({ where: { id: u.id }, select: { employmentStatus: true, joinDate: true } });
  const notEligible = eligibility(user ?? { employmentStatus: null, joinDate: null }, date, s);
  if (notEligible) return { error: notEligible };
  const q = await quoteClaim(u.id, amount, date, s);
  if (q.payout <= 0) return { error: `Plafon reimbursement periode ${formatDate(q.from)} – ${formatDate(q.to)} sudah habis.` };

  const wf = await workflowSteps("REIMBURSE", u.id);
  if (wf.error) return { error: wf.error };
  if (!wf.flow && !(await hasApprover(u.id))) return { error: "Atasan langsung Anda belum diatur atau sudah tidak aktif, jadi pengajuan belum bisa dikirim. Hubungi HRD." };
  const flow = await withDelegation(wf.flow, u.id);
  await prisma.medicalClaim.create({
    data: {
      userId: u.id, treatDate: date, provider: input.provider.trim().slice(0, 200), amount, payout: q.payout, percent: s.percent,
      note: input.note.trim().slice(0, 500) || null, ...(flow ? { approval: flow } : {}),
      files: { create: files.map((f) => ({ kind: f.kind, name: f.name.slice(0, 120), mime: f.mime, data: f.data })) },
    },
  });
  reimburseRefresh();
  return { approver: await firstApproverName(flow, u.id), payout: q.payout };
}

// Saat disetujui level terakhir: pembayaran dihitung ulang terhadap sisa plafon terbaru.
export async function finalPayout(claimId: string) {
  const c = await prisma.medicalClaim.findUnique({ where: { id: claimId } });
  if (!c) return 0;
  const q = await quoteClaim(c.userId, c.amount, c.treatDate, { ...(await getReimburseSettings()), percent: c.percent }, c.id);
  return Math.min(c.payout, q.payout);
}

// Baris gaji: reimbursement yang sudah disetujui sampai akhir periode dan belum dibayar.
export async function claimItems(userId: string, end: Date) {
  const s = await getReimburseSettings();
  const claims = await prisma.medicalClaim.findMany({
    where: { userId, status: "APPROVED", paidRunId: null, decidedAt: { lt: new Date(end.getTime() + DAY - 7 * 3600_000) } },
    orderBy: { treatDate: "asc" }, select: { id: true, payout: true, treatDate: true, provider: true },
  });
  if (!claims.length) return null;
  return {
    code: "RMB", name: "Reimbursement Pengobatan", kind: "PENDAPATAN", amount: round(claims.reduce((a, c) => a + c.payout, 0)), taxable: s.taxable,
    detail: claims.map((c) => `${formatDate(c.treatDate)} ${c.provider}`).join(", "), refs: claims.map((c) => c.id),
  };
}
