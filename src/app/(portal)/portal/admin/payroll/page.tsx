export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAccess } from "@/lib/access";
import { hasMenu } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { getPayrollSettings } from "@/lib/payroll-settings";
import PayrollClient from "./PayrollClient";
import { periodLabel, type LineInputs, type LineItem } from "@/lib/payroll-run";

export const metadata: Metadata = { title: "Payroll & Benefit" };

// Setup Payroll & Benefit: komponen gaji, BPJS, lembur, THR, dan setelan umum payroll.
export default async function PayrollPage() {
  const access = await getAccess();
  if (!access) redirect("/portal");
  if (!hasMenu(access, "gaji")) redirect("/portal/dashboard");

  const [components, settings, runs] = await Promise.all([
    prisma.payComponent.findMany({ orderBy: [{ sortOrder: "asc" }, { code: "asc" }] }),
    getPayrollSettings(),
    prisma.payrollRun.findMany({
      orderBy: { period: "desc" }, take: 24,
      include: { lines: { include: { user: { select: { name: true, employeeId: true, department: { select: { name: true } } } } } } },
    }),
  ]);
  return (
    <PayrollClient
      components={components.map((c) => ({ ...c, createdAt: c.createdAt.toISOString(), updatedAt: c.updatedAt.toISOString() }))}
      settings={settings}
      runs={runs.map((r) => ({
        id: r.id, period: r.period, label: periodLabel(r.period), status: r.status, includeThr: r.includeThr,
        finalizedBy: r.finalizedBy, finalizedAt: r.finalizedAt?.toISOString() ?? null,
        lines: r.lines
          .map((l) => ({
            id: l.id, userId: l.userId, name: l.user.name, employeeId: l.user.employeeId ?? "", department: l.user.department?.name ?? null,
            inputs: l.inputs as LineInputs, items: l.items as LineItem[], gross: l.gross, earnings: l.earnings, deductions: l.deductions,
            benefits: l.benefits, pph21: l.pph21, netPay: l.netPay, ptkp: l.ptkp, terRate: l.terRate, warning: l.warning,
          }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      }))}
    />
  );
}
