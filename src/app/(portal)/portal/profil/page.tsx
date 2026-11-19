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

// Jenis cuti lama (sebelum ada Jenis Cuti) untuk riwayat cuti.
const LEGACY_LEAVE: Record<string, string> = { TAHUNAN: "Cuti Tahunan", SAKIT: "Sakit", MELAHIRKAN: "Melahirkan", PENTING: "Keperluan Penting", LAINNYA: "Lainnya" };

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
  const [user, shiftDays, requests, salary, balances, loans, lastSlip, overtimes] = await Promise.all([
    prisma.user.findUnique({
      where: { id },
      select: {
        ...Object.fromEntries(PROFILE_KEYS.map((k) => [k, true])),
        id: true, name: true, employeeId: true, image: true, employmentStatus: true, position: true, branch: true,
        joinDate: true, contractEndDate: true, ptkpStatus: true, bpjsTkNumber: true, bpjsKesNumber: true,
        department: { select: { name: true } }, manager: { select: { name: true, employeeId: true } },
        family: { orderBy: { createdAt: "asc" }, select: { name: true, idNumber: true, relation: true } },
        attendances: { orderBy: { date: "desc" }, take: 400, select: { id: true, date: true, checkIn: true, checkOut: true, checkInAddr: true, status: true, note: true } },
        leaves: { orderBy: { startDate: "desc" }, take: 50, select: { id: true, type: true, startDate: true, endDate: true, totalDays: true, reason: true, status: true, delegateName: true, halfDay: true, policy: { select: { name: true } } } },
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
      select: { seqNo: true, principal: true, status: true, installments: { select: { seq: true, amount: true, status: true, period: true }, orderBy: { seq: "asc" } } },
    }),
    // Slip gaji 12 terakhir (yang pertama = slip terakhir).
    prisma.payslip.findMany({ where: { userId: id }, orderBy: [{ period: "desc" }, { createdAt: "desc" }], take: 12, select: { id: true, periodLabel: true, netPay: true } }),
    prisma.overtime.findMany({
      where: { userId: id, date: { gte: from, lte: to }, status: { in: ["DISETUJUI", "APPROVED", "MENUNGGU_KARYAWAN", "PENDING"] } },
      select: { date: true, startTime: true, endTime: true, status: true },
    }),
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
        // Pucuk pimpinan (tanpa atasan, punya bawahan aktif): "Owner".
        manager: user.manager ? `${user.manager.name}${user.manager.employeeId ? ` (${user.manager.employeeId})` : ""}`
          : (await prisma.user.count({ where: { managerId: user.id, isActive: true } })) > 0 ? "Owner" : null,
        joinDate: user.joinDate?.toISOString() ?? null, contractEnd: user.contractEndDate?.toISOString() ?? null,
        // Masa kerja ditulis lengkap: "1 tahun 3 bulan", "7 bulan", "2 tahun".
        tenure: months === null ? null : [Math.floor(months / 12) ? `${Math.floor(months / 12)} tahun` : "", months % 12 || !Math.floor(months / 12) ? `${months % 12} bulan` : ""].filter(Boolean).join(" "),
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
          schedule: l.installments.map((i) => ({ seq: i.seq, period: i.period, amount: i.amount, paid: i.status === "LUNAS" })),
        };
      })}
      lastSlip={lastSlip[0] ?? null}
      slips={lastSlip.map((x) => ({ id: x.id, periodLabel: x.periodLabel, netPay: x.netPay }))}
      values={values}
      family={user.family.map((f) => ({ name: f.name, idNumber: f.idNumber ?? "", relation: f.relation }))}
      calendar={{
        attendances: user.attendances, leaves: user.leaves, trips: user.businessTrips, shiftDays,
        overtimes: overtimes.map((o) => ({ date: o.date.toISOString().slice(0, 10), start: o.startTime, end: o.endTime, status: o.status })),
      }}
      leaveHistory={user.leaves.filter((l) => l.status !== "CANCELLED").map((l) => ({
        id: l.id, start: l.startDate.toISOString().slice(0, 10), end: l.endDate.toISOString().slice(0, 10), days: l.totalDays,
        name: l.policy?.name ?? LEGACY_LEAVE[l.type] ?? l.type, status: l.status, halfDay: !!l.halfDay,
      }))}
      requests={requests.map((r) => ({
        id: r.id, status: r.status, changes: r.changes as ProfileChanges, family: (r.family as FamilyRow[] | null) ?? null,
        reason: r.reason, note: r.note, decidedBy: r.decidedBy, decidedAt: r.decidedAt?.toISOString() ?? null, createdAt: r.createdAt.toISOString(),
      }))}
    />
  );
}
