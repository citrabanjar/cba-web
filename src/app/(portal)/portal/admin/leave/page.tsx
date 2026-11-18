export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAccess } from "@/lib/access";
import { hasMenu } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import LeaveClient from "./LeaveClient";
import { readApproval } from "@/lib/onboarding-interview";
import { computeBalances, getLeaveBalanceSwitch, maskBalances } from "@/lib/leave-balance";
import { isSuperAdmin } from "@/lib/roles";

export const metadata: Metadata = { title: "Cuti" };

// Setup Leave: kebijakan cuti, izin, dan dinas perusahaan.
export default async function LeavePage({ searchParams }: { searchParams: Promise<{ tab?: string; lihat?: string }> }) {
  const access = await getAccess();
  if (!access) redirect("/portal");
  if (!hasMenu(access, "absensi")) redirect("/portal/dashboard");

  const today = new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date())}T00:00:00Z`);
  const tripUser = { select: { name: true, employeeId: true, department: { select: { name: true } }, manager: { select: { name: true } } } };
  const [policies, computed, balanceSwitch, pendingLeaves, onLeaveNow, pendingTrips, onTripNow] = await Promise.all([
    prisma.leavePolicy.findMany({ orderBy: [{ sortOrder: "asc" }, { code: "asc" }] }),
    computeBalances(),
    getLeaveBalanceSwitch(),
    // Pengajuan cuti yang sedang berjalan (dipantau Admin; keputusan tetap di penyetuju).
    prisma.leaveRequest.findMany({
      where: { status: "PENDING" }, orderBy: { createdAt: "asc" },
      include: {
        policy: { select: { name: true } },
        user: { select: { name: true, employeeId: true, department: { select: { name: true } }, manager: { select: { name: true } } } },
      },
    }),
    // Karyawan yang sedang cuti hari ini (sudah disetujui).
    prisma.leaveRequest.findMany({
      where: { status: "APPROVED", startDate: { lte: today }, endDate: { gte: today }, user: { isActive: true } }, orderBy: { endDate: "asc" },
      include: { policy: { select: { name: true } }, user: { select: { name: true, employeeId: true, department: { select: { name: true } } } } },
    }),
    // Proses Dinas: pengajuan dinas luar yang berjalan, dan yang sedang dinas hari ini.
    prisma.businessTrip.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, include: { user: tripUser } }),
    prisma.businessTrip.findMany({
      where: { status: "APPROVED", startDate: { lte: today }, endDate: { gte: today }, user: { isActive: true } }, orderBy: { endDate: "asc" }, include: { user: tripUser },
    }),
  ]);
  // Penyetuju yang sedang mendapat giliran: level Workflow (nama langkah) atau atasan langsung.
  const requests = pendingLeaves.map((l) => {
    const flow = readApproval(l.approval);
    const step = flow?.steps.find((x) => !x.decision);
    return {
      id: l.id, name: l.user.name, employeeId: l.user.employeeId ?? "", department: l.user.department?.name ?? null,
      policy: l.policy?.name ?? l.type, start: l.startDate.toISOString().slice(0, 10), end: l.endDate.toISOString().slice(0, 10),
      days: l.totalDays, reason: l.reason, delegate: l.delegateName, createdAt: l.createdAt.toISOString(),
      approver: step?.name ?? (l.user.manager ? `Atasan langsung · ${l.user.manager.name}` : "—"),
    };
  });
  const onLeave = onLeaveNow.map((l) => ({
    id: l.id, name: l.user.name, employeeId: l.user.employeeId ?? "", department: l.user.department?.name ?? null,
    policy: l.policy?.name ?? l.type, start: l.startDate.toISOString().slice(0, 10), end: l.endDate.toISOString().slice(0, 10),
    days: l.totalDays, reason: l.reason, delegate: l.delegateName, createdAt: l.createdAt.toISOString(),
    approver: l.approvedBy ? `Disetujui ${l.approvedBy}` : "Disetujui",
  }));
  // Dinas memakai baris yang sama dengan cuti: kolom jenis = tujuan, alasan = keperluan.
  const tripRow = (x: (typeof pendingTrips)[number], approver: string) => ({
    id: x.id, name: x.user.name, employeeId: x.user.employeeId ?? "", department: x.user.department?.name ?? null,
    policy: x.destination, start: x.startDate.toISOString().slice(0, 10), end: x.endDate.toISOString().slice(0, 10),
    days: x.totalDays, reason: x.purpose, delegate: null, createdAt: x.createdAt.toISOString(), approver,
  });
  const trips = pendingTrips.map((x) => {
    const step = readApproval(x.approval)?.steps.find((s) => !s.decision);
    return tripRow(x, step?.name ?? (x.user.manager ? `Atasan langsung · ${x.user.manager.name}` : "—"));
  });
  const onTrip = onTripNow.map((x) => tripRow(x, x.approvedBy ? `Disetujui ${x.approvedBy}` : "Disetujui"));
  const { tab, lihat } = await searchParams;
  // Super Admin selalu melihat hitungan asli (untuk menyiapkan saldo awal); admin lain mengikuti saklar.
  const superAdmin = isSuperAdmin(access.role);
  const balances = superAdmin || balanceSwitch.active ? computed : maskBalances(computed);
  return (
    <LeaveClient
      policies={policies.map((p) => ({ ...p, createdAt: p.createdAt.toISOString(), updatedAt: p.updatedAt.toISOString() }))}
      balances={balances}
      balanceSwitch={balanceSwitch}
      superAdmin={superAdmin}
      requests={requests}
      onLeave={onLeave}
      trips={trips}
      onTrip={onTrip}
      view={lihat === "pengajuan" || lihat === "sedang" ? lihat : undefined}
      initialTab={tab === "pengajuan" || tab === "saldo" || tab === "dinas" ? tab : undefined}
    />
  );
}
