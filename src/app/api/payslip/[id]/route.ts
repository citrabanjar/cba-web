import { auth } from "@/auth";
import { getAccess } from "@/lib/access";
import { hasMenu } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { buildPayslipPdf } from "@/lib/payslip-pdf";
import type { LineItem } from "@/lib/payroll-run";

export const dynamic = "force-dynamic";

// PDF slip gaji: /api/payslip/<id slip>[?unduh=1]. Boleh pemilik slip, atau Admin berhak menu Payroll (gaji).
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const slip = await prisma.payslip.findUnique({
    where: { id },
    include: { user: { select: { name: true, employeeId: true, position: true, ptkpStatus: true, bankName: true, bankAccount: true, department: { select: { name: true } } } } },
  });
  if (!slip) return new Response("Slip tidak ditemukan.", { status: 404 });
  if (slip.userId !== session.user.id) {
    const access = await getAccess();
    if (!access || !hasMenu(access, "gaji")) return new Response("Forbidden", { status: 403 });
  }
  const [line, comps] = await Promise.all([
    prisma.payrollLine.findFirst({ where: { userId: slip.userId, run: { status: "FINAL", period: slip.period } }, select: { items: true, netPay: true } }),
    prisma.payComponent.findMany({ where: { method: { in: ["INPUT", "NOMINAL", "PERSEN", "PPH21"] } }, select: { code: true } }),
  ]);
  const url = new URL(req.url);
  let logo: Uint8Array | null = null;
  try {
    const r = await fetch(new URL("/logo.jpg", url.origin));
    if (r.ok) logo = new Uint8Array(await r.arrayBuffer());
  } catch { logo = null; }
  const items: LineItem[] = (line?.items as LineItem[] | undefined) ?? [
    { code: "GP", name: "Gaji Pokok", kind: "PENDAPATAN", amount: slip.basicSalary, detail: "", taxable: true },
    ...(slip.pph21 ? [{ code: "PPH21", name: "PPh Pasal 21", kind: "POTONGAN", amount: slip.pph21, detail: "", taxable: false }] : []),
  ];
  const u = slip.user;
  const bytes = await buildPayslipPdf({
    company: "PT. Citra Banjar Abadi",
    periodLabel: slip.periodLabel,
    paidAt: slip.paidAt ? new Date(slip.paidAt.getTime() + 7 * 3600_000).toISOString().slice(0, 10).split("-").reverse().join("-") : null,
    employee: { name: u.name, employeeId: u.employeeId, position: u.position, department: u.department?.name ?? null, ptkp: u.ptkpStatus, bank: u.bankName, account: u.bankAccount?.replace(/\D/g, "") ?? null },
    items, fixedCodes: comps.map((c) => c.code), netPay: line?.netPay ?? slip.netPay, logo, logoType: "jpg",
  });
  const name = `Slip Gaji ${(u.employeeId ?? "karyawan").replace(/[^\w-]/g, "")} ${slip.periodLabel.replace(/[^\w -]/g, "")}.pdf`;
  return new Response(Buffer.from(bytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `${url.searchParams.get("unduh") ? "attachment" : "inline"}; filename="${name}"`, "Cache-Control": "no-store" },
  });
}
