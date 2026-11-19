"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { fixRefresh, submitFixFor, type FixInput } from "@/lib/attendance-fix";
import { createLeave } from "@/lib/request-submit";
import { hasBalance, visibleBalances } from "@/lib/leave-balance";

export async function submitFix(input: FixInput) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Sesi tidak valid, silakan login ulang." };
  return submitFixFor({ id: session.user.id, name: session.user.name ?? null }, input);
}

export async function cancelFix(id: string) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Sesi tidak valid." };
  const f = await prisma.attendanceCorrection.findUnique({ where: { id } });
  if (!f || f.userId !== session.user.id) return { error: "Data tidak ditemukan." };
  if (f.status !== "PENDING") return { error: "Hanya pengajuan yang menunggu persetujuan yang bisa dibatalkan." };
  await prisma.attendanceCorrection.update({ where: { id }, data: { status: "CANCELLED" } });
  fixRefresh();
  return {};
}

// Pengajuan Absen: tidak masuk (hari ini / sudah lewat) dicatat sebagai potong Cuti Tahunan atau Izin Tanpa Hak Cuti.
// Saldo Cuti Tahunan dicek saat dikirim (createLeave): kurang → ditolak dengan sisa saldonya.
export type AbsenceInput = { kind: "TAHUNAN" | "TANPA_UPAH"; startDate: string; endDate: string; reason: string };
export async function submitAbsence(input: AbsenceInput) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Sesi tidak valid, silakan login ulang." };
  if (input.kind !== "TAHUNAN" && input.kind !== "TANPA_UPAH") return { error: "Pilih jenis pengajuan." };
  if (!input.startDate || !input.endDate) return { error: "Pilih tanggal tidak masuk." };
  if (!input.reason.trim()) return { error: "Tulis alasan tidak masuk." };
  const policies = await prisma.leavePolicy.findMany({ where: { isActive: true, category: input.kind }, orderBy: { sortOrder: "asc" } });
  const policy = input.kind === "TAHUNAN" ? policies.find((p) => hasBalance(p)) : policies[0];
  if (!policy) return { error: input.kind === "TAHUNAN" ? "Cuti Tahunan belum diatur di Setup Cuti. Hubungi HRD." : "Izin Tanpa Hak Cuti belum diatur di Setup Cuti. Hubungi HRD." };
  // Cek saldo dulu: saldo habis / belum ada → arahkan ke Izin Tanpa Hak Cuti.
  if (input.kind === "TAHUNAN") {
    const row = (await visibleBalances([session.user.id])).find((b) => b.policyId === policy.id);
    const available = row && !row.problem ? Math.max(0, row.balance - row.pending) : 0;
    if (available <= 0) return { error: "Saldo Cuti Tahunan Anda 0 hari. Ajukan sebagai Izin Tanpa Hak Cuti." };
  }
  const r = await createLeave(session.user.id, {
    policyId: policy.id, startDate: input.startDate, endDate: input.endDate, reason: input.reason.trim().slice(0, 500), dayPart: "PENUH", delegateId: "",
  }, { absence: true });
  return "error" in r && r.error ? { error: r.error } : { approver: "approver" in r ? r.approver : "", days: "days" in r ? r.days : "" };
}
