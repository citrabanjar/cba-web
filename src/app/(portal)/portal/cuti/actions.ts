"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import {
  addMonths, countLeaveDays, eligible, hasBalance, legacyType, todayDate, visibleBalances,
} from "@/lib/leave-balance";
import { firstApproverName, hasApprover } from "@/lib/approval";
import { workflowSteps } from "@/lib/workflow-settings";
import { isPersonApprover, withDelegation } from "@/lib/delegation";
import { getAbsenceBackDays } from "@/lib/absence-settings";
import { formatDate } from "@/lib/utils";

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
  return createLeave(session.user.id, {
    policyId: String(formData.get("policyId") ?? ""), startDate: String(formData.get("startDate") ?? ""), endDate: String(formData.get("endDate") ?? ""),
    reason: String(formData.get("reason") ?? "").trim(), dayPart: String(formData.get("dayPart") ?? "PENUH"), delegateId: String(formData.get("delegateId") ?? ""),
  });
}

// Ajukan Tidak Masuk (menu Kehadiran): hari ini atau mundur beberapa hari (batas di Setup Cuti), tanpa batas pengajuan H-x.
// Pilihan: potong Cuti Tahunan, atau izin tanpa upah (jenis cuti kategori Tanpa Upah). Penyetuju sama dengan Cuti.
export async function submitAbsence(input: { date: string; kind: "TAHUNAN" | "TANPA_UPAH"; reason: string }) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Sesi tidak valid, silakan login ulang." };
  const userId = session.user.id;
  const date = new Date(`${input.date}T00:00:00Z`);
  if (isNaN(date.getTime())) return { error: "Tanggal tidak valid." };
  const today = todayDate();
  const back = await getAbsenceBackDays();
  if (date > today) return { error: "Untuk tanggal yang akan datang, ajukan lewat menu Cuti." };
  if (date.getTime() < today.getTime() - back * 86_400_000) return { error: `Pengajuan tidak masuk paling lama ${back} hari ke belakang. Hubungi HRD untuk tanggal yang lebih lama.` };
  if (!input.reason.trim()) return { error: "Alasan wajib diisi." };
  const me = await prisma.user.findUnique({ where: { id: userId }, select: { employmentStatus: true, gender: true, joinDate: true } });
  const policies = await prisma.leavePolicy.findMany({ where: { isActive: true, category: input.kind }, orderBy: [{ sortOrder: "asc" }, { code: "asc" }] });
  const balances = await visibleBalances([userId]);
  // Cuti Tahunan = jenis yang punya saldo (Cuti Bersama tidak termasuk, sama seperti menu Cuti).
  const policy = me ? policies.find((p) => (p.category !== "TAHUNAN" || hasBalance(p)) && eligible(p, me, today, balances.find((r) => r.policyId === p.id)?.balance ?? 0)) : undefined;
  if (!policy) return { error: input.kind === "TAHUNAN" ? "Cuti Tahunan belum berlaku untuk Anda. Pilih izin tanpa upah atau hubungi HRD." : "Jenis izin tanpa upah belum diatur di Setup Cuti. Hubungi HRD." };
  return createLeave(userId, { policyId: policy.id, startDate: input.date, endDate: input.date, reason: input.reason.trim(), dayPart: "PENUH", delegateId: "" }, true);
}

type LeaveInput = { policyId: string; startDate: string; endDate: string; reason: string; dayPart: string; delegateId: string };

async function createLeave(userId: string, input: LeaveInput, urgent = false) {
  // Penyetuju = Level workflow Cuti bila aktif (menu Workflow); selain itu atasan langsung aktif, tanpa itu pengajuan tidak bisa dikirim.
  const wf = await workflowSteps("CUTI", userId);
  if (wf.error) return { error: wf.error };
  if (!wf.flow && !(await hasApprover(userId))) return { error: "Atasan langsung Anda belum diatur atau sudah tidak aktif, jadi pengajuan belum bisa dikirim. Hubungi HRD." };
  // Penyetuju yang sedang cuti dengan delegasi → pengajuan baru dialihkan ke delegasinya.
  const flow = await withDelegation(wf.flow, userId);

  const { policyId, startDate, endDate, reason, dayPart } = input;
  if (!policyId || !startDate || !endDate || !reason) return { error: "Semua field wajib diisi." };

  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return { error: "Tanggal tidak valid." };
  if (end < start) return { error: "Tanggal akhir tidak boleh sebelum tanggal mulai." };

  // Tanggal cuti tidak boleh beririsan dengan cuti / dinas luar yang sedang diajukan atau sudah disetujui,
  // maupun dengan kehadiran Cuti / Dinas yang sudah tercatat. Pengecualian: dua cuti setengah hari yang
  // berbeda bagian (pagi & siang) pada tanggal yang sama.
  {
    const range = (a: Date, b: Date) => `${formatDate(a)}${a.getTime() === b.getTime() ? "" : ` – ${formatDate(b)}`}`;
    const overlap = { startDate: { lte: end }, endDate: { gte: start } };
    const newHalf = dayPart === "AWAL" || dayPart === "AKHIR" ? dayPart : null;
    const [leaves, trip, att] = await Promise.all([
      prisma.leaveRequest.findMany({ where: { userId, status: { in: ["PENDING", "APPROVED"] }, ...overlap }, orderBy: { startDate: "asc" }, include: { policy: { select: { name: true } } } }),
      prisma.businessTrip.findFirst({ where: { userId, status: { in: ["PENDING", "APPROVED"] }, ...overlap }, orderBy: { startDate: "asc" } }),
      prisma.attendance.findFirst({ where: { userId, status: { in: ["CUTI", "DINAS"] }, date: { gte: start, lte: end } }, orderBy: { date: "asc" } }),
    ]);
    const leave = leaves.find((l) => !(newHalf && l.halfDay && l.halfDay !== newHalf && start.getTime() === end.getTime()
      && l.startDate.getTime() === start.getTime() && l.endDate.getTime() === end.getTime()));
    if (leave) {
      return { error: `Tanggal beririsan dengan ${leave.policy?.name ?? "cuti"} (${range(leave.startDate, leave.endDate)}) yang ${leave.status === "PENDING" ? "sedang diajukan" : "sudah disetujui"}. Pilih tanggal lain atau batalkan pengajuan itu dulu.` };
    }
    if (trip) {
      return { error: `Tanggal beririsan dengan dinas luar ${trip.destination} (${range(trip.startDate, trip.endDate)}) yang ${trip.status === "PENDING" ? "sedang diajukan" : "sudah disetujui"}.` };
    }
    if (att) return { error: `Tanggal ${formatDate(att.date)} sudah tercatat ${att.status === "CUTI" ? "Cuti" : "Dinas"} di kehadiran Anda.` };
  }

  const [policy, me] = await Promise.all([
    prisma.leavePolicy.findUnique({ where: { id: policyId } }),
    prisma.user.findUnique({ where: { id: userId }, select: { employmentStatus: true, gender: true, joinDate: true } }),
  ]);
  if (!policy || !me) return { error: "Jenis cuti tidak ditemukan." };
  const today = todayDate();
  const ownBalance = hasBalance(policy) ? (await visibleBalances([userId])).find((r) => r.policyId === policy.id)?.balance ?? 0 : 0;
  if (!eligible(policy, me, today, ownBalance) || policy.category === "DINAS") return { error: "Jenis cuti ini tidak berlaku untuk Anda." };

  if (!urgent && policy.noticeDays > 0 && start.getTime() < today.getTime() + policy.noticeDays * 86_400_000) {
    return { error: `Jenis cuti ini harus diajukan paling lambat ${policy.noticeDays} hari sebelum tanggal mulai. Untuk tidak masuk hari ini, gunakan Ajukan Tidak Masuk di menu Kehadiran.` };
  }

  // Delegasi tanggung jawab (Cuti Tahunan): wajib bila pemohon seorang penyetuju, opsional untuk karyawan lain.
  let delegate: { id: string; name: string } | null = null;
  if (policy.category === "TAHUNAN" && !urgent) {
    if (input.delegateId) {
      const d = await prisma.user.findUnique({ where: { id: input.delegateId }, select: { id: true, name: true, isActive: true } });
      if (!d?.isActive || d.id === userId) return { error: "Delegasi harus karyawan aktif selain Anda." };
      const busy = await prisma.leaveRequest.findFirst({ where: { userId: d.id, status: { in: ["PENDING", "APPROVED"] }, startDate: { lte: end }, endDate: { gte: start } }, select: { id: true } });
      if (busy) return { error: `${d.name} juga mengajukan / sedang cuti di tanggal itu. Pilih delegasi lain.` };
      delegate = { id: d.id, name: d.name };
    } else if (await isPersonApprover(userId)) {
      return { error: "Anda memegang hak persetujuan, jadi pilih delegasi tanggung jawab selama cuti." };
    }
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
      urgent, ...(delegate ? { delegateId: delegate.id, delegateName: delegate.name } : {}),
    },
  });

  revalidatePath("/portal/cuti");
  revalidatePath("/portal/kehadiran");
  revalidatePath("/portal/admin/leave");
  return { ok: true, days: fmt(totalDays), unpaid: unpaidDays > 0 ? fmt(unpaidDays) : null, approver: await firstApproverName(flow, userId) };
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
