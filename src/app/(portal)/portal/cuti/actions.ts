"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import {
  addMonths, countLeaveDays, eligible, hasBalance, legacyType, todayDate, visibleBalances,
} from "@/lib/leave-balance";
import { hasApprover } from "@/lib/approval";
import { workflowSteps } from "@/lib/workflow-settings";

export async function getLeaveRequests() {
  const session = await auth();
  if (!session?.user?.id) return [];

  return prisma.leaveRequest.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    include: { policy: { select: { code: true, name: true } } },
  });
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100).replace(".", ","));

// Pengajuan cuti memakai jenis dari Setup Leave. Dicek: jenis boleh dipakai karyawan ini,
// batas pengajuan (H-x), jatah per kejadian, sisa saldo (Cuti Tahunan / Cuti Masa Kontrak),
// dan tidak bertabrakan dengan pengajuan lain.
export async function submitLeave(_prevState: unknown, formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Sesi tidak valid, silakan login ulang." };
  const userId = session.user.id;
  // Penyetuju = Level workflow Cuti bila aktif (menu Workflow); selain itu atasan langsung aktif, tanpa itu pengajuan tidak bisa dikirim.
  const { flow, error: flowError } = await workflowSteps("CUTI", userId);
  if (flowError) return { error: flowError };
  if (!flow && !(await hasApprover(userId))) return { error: "Atasan langsung Anda belum diatur atau sudah tidak aktif, jadi pengajuan belum bisa dikirim. Hubungi HRD." };

  const policyId = String(formData.get("policyId") ?? "");
  const startDate = String(formData.get("startDate") ?? "");
  const endDate = String(formData.get("endDate") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  const dayPart = String(formData.get("dayPart") ?? "PENUH");
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

  // Shift setengah hari (mis. Sabtu) dihitung 0,5 hari.
  let totalDays = await countLeaveDays(userId, start, end, policy.unit, { halfShifts: true });
  if (totalDays <= 0) return { error: "Tidak ada hari kerja di rentang tanggal itu." };
  // Setengah hari: satu tanggal kerja, dihitung 0,5 hari.
  const halfDay = dayPart === "AWAL" || dayPart === "AKHIR" ? dayPart : null;
  if (halfDay) {
    if (!policy.allowHalfDay) return { error: "Jenis cuti ini tidak bisa setengah hari." };
    if (start.getTime() !== end.getTime() || totalDays !== 1) return { error: "Cuti setengah hari hanya untuk satu tanggal hari kerja." };
    totalDays = 0.5;
  }

  if (policy.quota !== null && !hasBalance(policy)) {
    if (policy.unit === "BULAN") {
      if (end >= addMonths(start, policy.quota)) return { error: `Paling lama ${policy.quota} bulan untuk jenis cuti ini.` };
    } else if (totalDays > policy.quota) {
      return { error: `Paling banyak ${policy.quota} hari untuk jenis cuti ini.` };
    }
  }

  let unpaidDays = 0;
  if (hasBalance(policy) || policy.deductsAnnual) {
    const rows = await visibleBalances([userId]);
    const row = hasBalance(policy) ? rows.find((r) => r.policyId === policy.id) : rows[0];
    if (!row) return { error: "Saldo cuti Anda belum tersedia. Hubungi HRD." };
    if (row.problem) return { error: "Saldo cuti Anda belum bisa dihitung (tanggal masuk kosong). Hubungi HRD." };
    // Saldo kurang: kelebihannya masuk cuti di luar tanggungan (tidak memotong saldo).
    const available = Math.max(0, row.balance - row.pending);
    if (totalDays > available) unpaidDays = Math.round((totalDays - available) * 100) / 100;
  }

  const clash = await prisma.leaveRequest.findFirst({
    where: { userId, status: { in: ["PENDING", "APPROVED"] }, startDate: { lte: end }, endDate: { gte: start } },
    select: { id: true },
  });
  if (clash) return { error: "Tanggal itu bertabrakan dengan pengajuan cuti lain." };

  await prisma.leaveRequest.create({
    data: {
      userId, policyId: policy.id, type: legacyType(policy.category),
      startDate: start, endDate: end, totalDays, halfDay, unpaidDays, reason, status: "PENDING", ...(flow ? { approval: flow } : {}),
    },
  });

  revalidatePath("/portal/cuti");
  revalidatePath("/portal/admin/leave");
  return { ok: true, days: fmt(totalDays), unpaid: unpaidDays > 0 ? fmt(unpaidDays) : null };
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
