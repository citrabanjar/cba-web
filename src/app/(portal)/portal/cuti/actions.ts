"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import {
  addMonths, computeBalances, countLeaveDays, eligible, hasBalance, legacyType, todayDate,
} from "@/lib/leave-balance";

export async function getLeaveRequests() {
  const session = await auth();
  if (!session?.user?.id) return [];

  return prisma.leaveRequest.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    include: { policy: { select: { code: true, name: true } } },
  });
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

// Pengajuan cuti memakai jenis dari Setup Leave. Dicek: jenis boleh dipakai karyawan ini,
// batas pengajuan (H-x), jatah per kejadian, sisa saldo (Cuti Tahunan / Cuti Masa Kontrak),
// dan tidak bertabrakan dengan pengajuan lain.
export async function submitLeave(_prevState: unknown, formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Sesi tidak valid, silakan login ulang." };
  const userId = session.user.id;

  const policyId = String(formData.get("policyId") ?? "");
  const startDate = String(formData.get("startDate") ?? "");
  const endDate = String(formData.get("endDate") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!policyId || !startDate || !endDate || !reason) return { error: "Semua field wajib diisi." };

  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return { error: "Tanggal tidak valid." };
  if (end < start) return { error: "Tanggal akhir tidak boleh sebelum tanggal mulai." };

  const [policy, me] = await Promise.all([
    prisma.leavePolicy.findUnique({ where: { id: policyId } }),
    prisma.user.findUnique({ where: { id: userId }, select: { employmentStatus: true, gender: true, joinDate: true } }),
  ]);
  if (!policy || !me) return { error: "Jenis cuti tidak ditemukan." };
  const today = todayDate();
  if (!eligible(policy, me, today) || policy.category === "DINAS") return { error: "Jenis cuti ini tidak berlaku untuk Anda." };

  if (policy.noticeDays > 0 && start.getTime() < today.getTime() + policy.noticeDays * 86_400_000) {
    return { error: `Jenis cuti ini harus diajukan paling lambat ${policy.noticeDays} hari sebelum tanggal mulai.` };
  }

  const totalDays = await countLeaveDays(userId, start, end, policy.unit);
  if (totalDays <= 0) return { error: "Tidak ada hari kerja di rentang tanggal itu." };

  if (policy.quota !== null && !hasBalance(policy)) {
    if (policy.unit === "BULAN") {
      if (end >= addMonths(start, policy.quota)) return { error: `Paling lama ${policy.quota} bulan untuk jenis cuti ini.` };
    } else if (totalDays > policy.quota) {
      return { error: `Paling banyak ${policy.quota} hari untuk jenis cuti ini.` };
    }
  }

  if (hasBalance(policy) || policy.deductsAnnual) {
    const rows = await computeBalances([userId]);
    const row = hasBalance(policy) ? rows.find((r) => r.policyId === policy.id) : rows[0];
    if (!row) return { error: "Saldo cuti Anda belum tersedia. Hubungi HRD." };
    if (row.problem) return { error: "Saldo cuti Anda belum bisa dihitung (tanggal masuk kosong). Hubungi HRD." };
    const available = row.balance - row.pending;
    if (totalDays > available) return { error: `Sisa saldo yang bisa diajukan ${fmt(Math.max(0, available))} hari, pengajuan ini ${totalDays} hari.` };
  }

  const clash = await prisma.leaveRequest.findFirst({
    where: { userId, status: { in: ["PENDING", "APPROVED"] }, startDate: { lte: end }, endDate: { gte: start } },
    select: { id: true },
  });
  if (clash) return { error: "Tanggal itu bertabrakan dengan pengajuan cuti lain." };

  await prisma.leaveRequest.create({
    data: {
      userId, policyId: policy.id, type: legacyType(policy.category),
      startDate: start, endDate: end, totalDays, reason, status: "PENDING",
    },
  });

  revalidatePath("/portal/cuti");
  revalidatePath("/portal/admin/leave");
  return { ok: true, days: totalDays };
}

export async function cancelLeave(id: string) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Sesi tidak valid." };

  const req = await prisma.leaveRequest.findUnique({ where: { id } });
  if (!req || req.userId !== session.user.id) return { error: "Pengajuan tidak ditemukan." };
  if (req.status !== "PENDING") return { error: "Hanya pengajuan yang masih PENDING yang bisa dibatalkan." };

  await prisma.leaveRequest.update({
    where: { id },
    data: { status: "CANCELLED" },
  });

  revalidatePath("/portal/cuti");
  return { ok: true };
}
