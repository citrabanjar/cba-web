export const dynamic = "force-dynamic";
import { computeBalances } from "@/lib/leave-balance";
import { describe, type PayParams } from "@/lib/payroll";
import { notFound, redirect } from "next/navigation";
import { getAccess } from "@/lib/access";
import { hasMenu, isSuperAdmin } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { getMasterOptions } from "@/lib/master-data";
import { PERSONAL_LOG_LABELS, WORK_LOG_LABELS } from "@/lib/personal-info";
import { getShiftCalendar } from "@/lib/schedule";
import KaryawanDetailClient from "./KaryawanDetailClient";

function tenure(joinDate: Date | null): string | null {
  if (!joinDate) return null;
  const now = new Date();
  let months =
    (now.getFullYear() - joinDate.getFullYear()) * 12 +
    (now.getMonth() - joinDate.getMonth());
  if (now.getDate() < joinDate.getDate()) months -= 1;
  if (months < 0) return null;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (years === 0) return `${rest} bulan`;
  return rest === 0 ? `${years} tahun` : `${years} tahun ${rest} bulan`;
}

export default async function KaryawanDetailPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aksi?: string }>;
}) {
  const access = await getAccess();
  if (!access) redirect("/portal");
  if (!hasMenu(access, "karyawan")) redirect("/portal/dashboard");

  const { id } = await params;
  const canSeePay = hasMenu(access, "gaji");

  // Pakai select eksplisit supaya passwordHash tidak ikut terkirim ke client.
  const employee = await prisma.user.findFirst({
    where: { id, role: { not: "SUPER_ADMIN" } },
    select: {
      id: true, employeeNo: true, employeeId: true, name: true, email: true,
      phone: true, image: true, role: true, menuAccess: true,
      employmentStatus: true, position: true, branch: true, joinDate: true,
      contractEndDate: true, resignDate: true, paymentSchedule: true,
      spkNumber: true, spkDate: true,
      bankName: true, bankAccount: true, bankHolder: true, isActive: true,
      idType: true, ktpNumber: true, address: true, currentAddress: true,
      addressSameAsId: true, birthPlace: true, birthDate: true,
      gender: true, religion: true, maritalStatus: true, nationality: true,
      emergencyName: true, emergencyPhone: true, emergencyRelation: true,
      npwp: true, ptkpStatus: true, taxability: true, taxStatus: true,
      taxObjectCode: true, bpjsTkNumber: true, bpjsTkActive: true,
      bpjsKesNumber: true, bpjsKesActive: true, managerId: true,
      manager: { select: { name: true, employeeId: true } },
      department: { select: { id: true, name: true } },
      employmentEvents: {
        orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }],
        select: {
          id: true, type: true, effectiveDate: true, contractEndDate: true,
          spkNumber: true, reason: true, createdBy: true,
        },
      },
      family: {
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, idNumber: true, relation: true },
      },
      changeLogs: {
        where: { field: { in: Object.keys({ ...PERSONAL_LOG_LABELS, ...WORK_LOG_LABELS }) } },
        orderBy: { createdAt: "desc" },
        take: 200,
        select: { id: true, field: true, changedBy: true, createdAt: true },
      },
      attendances: {
        orderBy: { date: "desc" },
        take: 400, // kira-kira setahun, untuk kalender kehadiran
        select: {
          id: true, date: true, checkIn: true, checkOut: true,
          checkInAddr: true, status: true, note: true,
        },
      },
      leaves: {
        orderBy: { startDate: "desc" },
        take: 50,
        select: {
          id: true, type: true, startDate: true, endDate: true,
          totalDays: true, reason: true, status: true, policy: { select: { code: true, name: true } },
        },
      },
      businessTrips: {
        orderBy: { startDate: "desc" },
        take: 50,
        select: {
          id: true, destination: true, purpose: true, startDate: true,
          endDate: true, totalDays: true, status: true,
        },
      },
    },
  });

  if (!employee) notFound();

  // Data gaji hanya diambil kalau akun ini punya akses menu Gaji.
  const salaries = canSeePay
    ? await prisma.employeeSalary.findMany({
        where: { userId: id },
        orderBy: { effectiveDate: "desc" },
        select: {
          id: true, effectiveDate: true, basicSalary: true, bpjsTkBase: true,
          bpjsKesBase: true, note: true, createdBy: true,
          components: { select: { id: true, type: true, name: true, amount: true, code: true } },
        },
      })
    : [];

  const payslips = canSeePay
    ? await prisma.payslip.findMany({
        where: { userId: id },
        orderBy: { period: "desc" },
        take: 12,
        select: { id: true, periodLabel: true, netPay: true, paidAt: true, paidVia: true },
      })
    : [];

  // Jadwal kerja: riwayat, pilihan pola, dan shift per tanggal (setahun ke belakang, 3 bulan ke depan).
  const now = new Date();
  const [schedules, patterns, shiftDays] = await Promise.all([
    prisma.employeeSchedule.findMany({
      where: { userId: id },
      orderBy: { effectiveDate: "desc" },
      select: { id: true, type: true, effectiveDate: true, note: true, createdBy: true, pattern: { select: { id: true, name: true } } },
    }),
    prisma.workPattern.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, cycleDays: true } }),
    getShiftCalendar(
      id,
      new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), 1)),
      new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 4, 0)),
    ),
  ]);

  const managers = await prisma.user.findMany({
    where: { role: { not: "SUPER_ADMIN" }, isActive: true, id: { not: id } },
    select: { id: true, name: true, employeeId: true },
    orderBy: { name: "asc" },
  });

  return (
    <KaryawanDetailClient
      employee={{
        ...employee,
        employeeId: employee.employeeId ?? "",
        salaries,
        payslips,
      }}
      tenure={tenure(employee.joinDate)}
      managers={managers}
      initialAction={(await searchParams).aksi}
      master={await getMasterOptions()}
      canSeePay={canSeePay}
      isSuper={isSuperAdmin(access.role)}
      canEdit={isSuperAdmin(access.role) || employee.role === "KARYAWAN"}
      schedules={schedules}
      patterns={patterns}
      shiftDays={shiftDays}
      leaveBalances={await computeBalances([id])}
      payComponents={canSeePay ? (await prisma.payComponent.findMany({
        where: { OR: [{ isActive: true }, { employees: { some: { userId: id } } }] }, orderBy: { sortOrder: "asc" },
        include: { employees: { where: { userId: id }, select: { startDate: true, endDate: true, note: true } } },
      })).map((c) => {
        const a = c.employees[0];
        const d = (x: Date | null) => (x ? x.toISOString().slice(0, 10) : null);
        return {
          componentId: c.id, code: c.code, name: c.name, kind: c.kind, method: c.method,
          formula: describe({ ...c, params: (c.params as PayParams | null) ?? null }),
          assigned: a ? { startDate: d(a.startDate), endDate: d(a.endDate), note: a.note } : null,
        };
      }) : []}
      payOptions={(await prisma.payComponent.findMany({
        where: { isActive: true, method: "INPUT", kind: { in: ["PENDAPATAN", "POTONGAN"] }, NOT: { code: "GP" } },
        orderBy: { sortOrder: "asc" }, select: { code: true, name: true, kind: true },
      }))}
    />
  );
}
