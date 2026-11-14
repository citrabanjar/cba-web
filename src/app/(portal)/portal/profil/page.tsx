export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isSuperAdmin } from "@/lib/roles";
import { getShiftCalendar } from "@/lib/schedule";
import { visibleBalances } from "@/lib/leave-balance";
import { PROFILE_KEYS, profileValue, type FamilyRow, type ProfileChanges } from "@/lib/profile-change";
import ProfilClient from "./ProfilClient";

export const metadata: Metadata = { title: "Profil Saya" };

const monthsBetween = (a: Date, b: Date) => (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + b.getUTCMonth() - a.getUTCMonth() - (b.getUTCDate() < a.getUTCDate() ? 1 : 0);
const monthRange = () => {
  const now = new Date();
  return [new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), 1)), new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 3, 0)), now] as const;
};

// Profil Saya: data diri karyawan (hanya baca) + pengajuan perubahan yang disetujui Admin.
// Gaji & tunjangan yang berlaku saat ini tampil di tab Pekerjaan (hanya baca).
export default async function ProfilPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/portal");
  if (isSuperAdmin(session.user.role)) redirect("/portal/dashboard");
  const id = session.user.id;

  const [from, to, now] = monthRange();
  const [user, shiftDays, requests, salary, balances, loans, lastSlip] = await Promise.all([
    prisma.user.findUnique({
      where: { id },
      select: {
        ...Object.fromEntries(PROFILE_KEYS.map((k) => [k, true])),
        id: true, name: true, employeeId: true, image: true, employmentStatus: true, position: true, branch: true,
        joinDate: true, contractEndDate: true, ptkpStatus: true, bpjsTkNumber: true, bpjsKesNumber: true,
        department: { select: { name: true } }, manager: { select: { name: true, employeeId: true } },
        family: { orderBy: { createdAt: "asc" }, select: { name: true, idNumber: true, relation: true } },
        attendances: { orderBy: { date: "desc" }, take: 400, select: { id: true, date: true, checkIn: true, checkOut: true, checkInAddr: true, status: true, note: true } },
        leaves: { orderBy: { startDate: "desc" }, take: 50, select: { id: true, type: true, startDate: true, endDate: true, totalDays: true, reason: true, status: true } },
        businessTrips: { orderBy: { startDate: "desc" }, take: 50, select: { id: true, destination: true, startDate: true, endDate: true, status: true } },
      },
    }),
    getShiftCalendar(id, from, to),
    prisma.profileChangeRequest.findMany({ where: { userId: id }, orderBy: { createdAt: "desc" }, take: 10 }),
    // Gaji yang berlaku hari ini (WIB).
    prisma.employeeSalary.findFirst({
      where: { userId: id, effectiveDate: { lte: new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(now)}T00:00:00Z`) } },
      orderBy: { effectiveDate: "desc" },
      select: { effectiveDate: true, basicSalary: true, dailyWage: true, monthlyFactor: true, components: { where: { type: "TUNJANGAN" }, select: { name: true, amount: true } } },
    }),
    visibleBalances([id]),
    // Pinjaman yang masih berjalan / disetujui (belum lunas).
    prisma.employeeLoan.findMany({
      where: { userId: id, status: { in: ["DISETUJUI", "BERJALAN"] } }, orderBy: { createdAt: "asc" },
      select: { seqNo: true, principal: true, status: true, installments: { select: { amount: true, status: true, period: true }, orderBy: { seq: "asc" } } },
    }),
    prisma.payslip.findFirst({ where: { userId: id }, orderBy: { period: "desc" }, select: { periodLabel: true, netPay: true } }),
  ]);
  if (!user) redirect("/portal");
  const record = user as unknown as Record<string, unknown>;
  const values = Object.fromEntries(PROFILE_KEYS.map((k) => [k, profileValue(record, k)]));
  const months = user.joinDate ? monthsBetween(user.joinDate, now) : null;

  return (
    <ProfilClient
      me={{
        id: user.id, name: user.name, employeeId: user.employeeId, image: user.image,
        status: user.employmentStatus, position: user.position, branch: user.branch, department: user.department?.name ?? null,
        manager: user.manager ? `${user.manager.name}${user.manager.employeeId ? ` (${user.manager.employeeId})` : ""}` : null,
        joinDate: user.joinDate?.toISOString() ?? null, contractEnd: user.contractEndDate?.toISOString() ?? null,
        tenure: months === null ? null : `${Math.floor(months / 12)} th ${months % 12} bln`,
        ptkp: user.ptkpStatus, bpjsTk: user.bpjsTkNumber, bpjsKes: user.bpjsKesNumber,
      }}
      salary={salary ? {
        effectiveDate: salary.effectiveDate.toISOString(), basic: salary.basicSalary, dailyWage: salary.dailyWage, monthlyFactor: salary.monthlyFactor,
        allowances: salary.components.map((c) => ({ name: c.name, amount: c.amount })),
      } : null}
      balances={balances}
      loans={loans.map((l) => {
        const left = l.installments.filter((i) => i.status !== "LUNAS");
        return {
          no: l.seqNo ?? 0, principal: l.principal, status: l.status, remaining: left.reduce((n, i) => n + i.amount, 0),
          left: left.length, tenor: l.installments.length, monthly: left[0]?.amount ?? l.installments[0]?.amount ?? 0, next: left[0]?.period ?? null,
        };
      })}
      lastSlip={lastSlip}
      values={values}
      family={user.family.map((f) => ({ name: f.name, idNumber: f.idNumber ?? "", relation: f.relation }))}
      calendar={{ attendances: user.attendances, leaves: user.leaves, trips: user.businessTrips, shiftDays }}
      requests={requests.map((r) => ({
        id: r.id, status: r.status, changes: r.changes as ProfileChanges, family: (r.family as FamilyRow[] | null) ?? null,
        reason: r.reason, note: r.note, decidedBy: r.decidedBy, decidedAt: r.decidedAt?.toISOString() ?? null, createdAt: r.createdAt.toISOString(),
      }))}
    />
  );
}
