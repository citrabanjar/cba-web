export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAccess } from "@/lib/access";
import { hasMenu } from "@/lib/roles";
import type { PayParams } from "@/lib/payroll";
import { prisma } from "@/lib/prisma";
import { getPayrollSettings, getTaxSettings } from "@/lib/payroll-settings";
import PayrollClient from "./PayrollClient";
import { normalizeInputs, periodLabel, type LineInputs, type LineItem } from "@/lib/payroll-run";

export const metadata: Metadata = { title: "Payroll & Benefit" };

// Setup Payroll & Benefit: komponen gaji, BPJS, lembur, THR, dan setelan umum payroll.
export default async function PayrollPage() {
  const access = await getAccess();
  if (!access) redirect("/portal");
  if (!hasMenu(access, "gaji")) redirect("/portal/dashboard");

  const today = new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date())}T00:00:00Z`);
  const [components, settings, runs, employees, taxSettings] = await Promise.all([
    prisma.payComponent.findMany({ orderBy: [{ sortOrder: "asc" }, { code: "asc" }], include: { employees: { select: { userId: true, startDate: true, endDate: true } } } }),
    getPayrollSettings(),
    prisma.payrollRun.findMany({
      orderBy: { period: "desc" }, take: 24,
      include: { lines: { include: { user: { select: { name: true, employeeId: true, department: { select: { name: true } } } } } } },
    }),
    prisma.user.findMany({
      where: { isActive: true, role: { not: "SUPER_ADMIN" } }, orderBy: { name: "asc" },
      select: { id: true, name: true, employeeId: true, department: { select: { name: true } } },
    }),
    getTaxSettings(),
  ]);
  return (
    <PayrollClient
      components={components.map(({ employees: assigned, createdAt, updatedAt, ...c }) => ({
        ...c, params: (c.params as PayParams | null) ?? null, employeeIds: assigned.filter((e) => (!e.endDate || e.endDate >= today) && (!e.startDate || e.startDate <= today)).map((e) => e.userId),
        createdAt: createdAt.toISOString(), updatedAt: updatedAt.toISOString(),
      }))}
      employees={employees.map((e) => ({ id: e.id, name: e.name, employeeId: e.employeeId ?? "", department: e.department?.name ?? null }))}
      nonRoutine={components.filter((c) => c.isActive && c.method === "THR").map((c) => ({ code: c.code, name: c.name }))}
      taxSettings={taxSettings}
      settings={settings}
      runs={runs.map((r) => ({
        id: r.id, period: r.period, label: periodLabel(r.period), status: r.status, extraCodes: r.extraCodes.length ? r.extraCodes : r.includeThr ? ["THR"] : [],
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
