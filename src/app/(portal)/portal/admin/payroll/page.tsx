export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAccess } from "@/lib/access";
import { hasMenu } from "@/lib/roles";
import { plannedHours, restDaysOf, restKey, syncRevisions } from "@/lib/overtime";
import type { AdminOvertime } from "../lembur/LemburAdminClient";
import OvertimeRevisions from "./OvertimeRevisions";
import type { PayParams } from "@/lib/payroll";
import { prisma } from "@/lib/prisma";
import { ensureSystemComponents, getPayrollSettings, getTaxSettings, getTerSettings } from "@/lib/payroll-settings";
import PayrollClient from "./PayrollClient";
import { normalizeInputs, periodLabel, type LineInputs, type LineItem } from "@/lib/payroll-run";
import { getBonusSchedule } from "@/lib/payroll-bonus";

export const metadata: Metadata = { title: "Payroll & Benefit" };

// Setup Payroll & Benefit: komponen gaji, BPJS, lembur, THR, dan setelan umum payroll.
export default async function PayrollPage() {
  const access = await getAccess();
  if (!access) redirect("/portal");
  if (!hasMenu(access, "gaji")) redirect("/portal/dashboard");

  const today = new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date())}T00:00:00Z`);
  await ensureSystemComponents();
  await syncRevisions().catch(() => 0);
  const [components, settings, runs, employees, taxSettings, terSettings, bonus] = await Promise.all([
    prisma.payComponent.findMany({ orderBy: [{ sortOrder: "asc" }, { code: "asc" }], include: { employees: { select: { userId: true, startDate: true, endDate: true } } } }),
    getPayrollSettings(),
    prisma.payrollRun.findMany({
      orderBy: { period: "desc" }, take: 60,
      include: { lines: { include: { user: { select: { name: true, employeeId: true, department: { select: { name: true } } } } } } },
    }),
    prisma.user.findMany({
      where: { isActive: true, role: { not: "SUPER_ADMIN" } }, orderBy: { name: "asc" },
      select: { id: true, name: true, employeeId: true, department: { select: { name: true } } },
    }),
    getTaxSettings(),
    getTerSettings(),
    getBonusSchedule(),
  ]);
  // Revisi jam lembur menunggu keputusan Admin Payroll.
  const revs = await prisma.overtime.findMany({
    where: { revisionStatus: "MENUNGGU" }, orderBy: { date: "asc" },
    include: { user: { select: { name: true, employeeId: true } }, order: { select: { number: true } } },
  });
  const revAtt = revs.length
    ? await prisma.attendance.findMany({ where: { OR: revs.map((r) => ({ userId: r.userId, date: r.date })) }, select: { userId: true, date: true, checkOut: true } })
    : [];
  const revRest = await restDaysOf(revs);
  const revisions: AdminOvertime[] = revs.map((r) => {
    const a = revAtt.find((x) => x.userId === r.userId && x.date.getTime() === r.date.getTime());
    return {
      id: r.id, name: r.user.name, employeeId: r.user.employeeId, date: r.date.toISOString().slice(0, 10), start: r.startTime, end: r.endTime,
      breakStart: r.breakStart, breakEnd: r.breakEnd, planned: plannedHours(r, revRest.has(restKey(r.userId, r.date))), rest: revRest.has(restKey(r.userId, r.date)), spl: r.order?.number ?? null, status: r.status,
      checkOut: a?.checkOut ? new Date(a.checkOut.getTime() + 7 * 3600_000).toISOString().slice(11, 16) : null, paid: null,
      revisionStatus: r.revisionStatus, revisionEnd: r.revisionEnd, note: r.note, reason: r.reason,
    };
  });
  return (
    <PayrollClient
      revisions={<OvertimeRevisions items={revisions} />}
      components={components.map(({ employees: assigned, createdAt, updatedAt, ...c }) => ({
        ...c, params: (c.params as PayParams | null) ?? null, employeeIds: assigned.filter((e) => !e.endDate || e.endDate >= today).map((e) => e.userId), // termasuk yang mulai nanti (karyawan baru)
        createdAt: createdAt.toISOString(), updatedAt: updatedAt.toISOString(),
      }))}
      employees={employees.map((e) => ({ id: e.id, name: e.name, employeeId: e.employeeId ?? "", department: e.department?.name ?? null }))}
      nonRoutine={components.filter((c) => c.isActive && c.method === "THR").map((c) => ({ code: c.code, name: c.name }))}
      bonus={bonus}
      taxSettings={taxSettings}
      terSettings={terSettings}
      settings={settings}
      runs={runs.map((r) => ({
        id: r.id, period: r.period, label: periodLabel(r.period), status: r.status, frequency: r.frequency, extraCodes: r.extraCodes.length ? r.extraCodes : r.includeThr ? ["THR"] : [],
        finalizedBy: r.finalizedBy, finalizedAt: r.finalizedAt?.toISOString() ?? null,
        lines: r.lines
          .map((l) => ({
            id: l.id, userId: l.userId, name: l.user.name, employeeId: l.user.employeeId ?? "", department: l.user.department?.name ?? null,
            inputs: normalizeInputs(l.inputs) as LineInputs, items: l.items as LineItem[], gross: l.gross, earnings: l.earnings, deductions: l.deductions,
            benefits: l.benefits, pph21: l.pph21, netPay: l.netPay, ptkp: l.ptkp, terRate: l.terRate, warning: l.warning,
          }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      }))}
    />
  );
}
