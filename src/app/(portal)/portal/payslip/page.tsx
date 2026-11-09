export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { FileText } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatDate, formatRupiah } from "@/lib/utils";
import { T } from "@/components/i18n";
import type { LineItem } from "@/lib/payroll-run";

export const metadata: Metadata = { title: "Slip Gaji" };

export default async function PayslipPage() {
  const session = await auth();
  if (!session?.user) redirect("/portal");

  const payslips = await prisma.payslip.findMany({
    where: { userId: session.user.id! },
    orderBy: { period: "desc" },
  });
  // Rincian per baris dari Proses Gaji yang sudah final (mis. angsuran tiap pinjaman tampil terpisah).
  const lines = await prisma.payrollLine.findMany({
    where: { userId: session.user.id!, run: { status: "FINAL", period: { in: payslips.map((p) => p.period) } } },
    select: { items: true, run: { select: { period: true } } },
  });
  const detailOf = new Map(lines.map((l) => [l.run.period, l.items as LineItem[]]));

  return (
    <div className="bg-gray-50 min-h-full">
      <div className="px-6 py-4 border-b border-gray-100 bg-white">
        <h2 className="font-bold text-gray-800"><T>Slip Gaji</T></h2>
        <p className="text-xs text-gray-400 mt-0.5">{session.user.name}</p>
      </div>

      <div className="max-w-3xl px-6 py-6">
        {payslips.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
            <FileText size={40} className="text-gray-200 mx-auto mb-3" />
            <p className="text-gray-500 font-medium"><T>Belum ada slip gaji tersedia</T></p>
            <p className="text-xs text-gray-400 mt-1"><T>Slip gaji akan muncul setelah proses payroll selesai</T></p>
          </div>
        ) : (
          <div className="space-y-3">
            {payslips.map((slip) => (
              <div key={slip.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-gray-800 text-sm">{slip.periodLabel}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      <T>Take Home Pay:</T> <span className="font-semibold text-ink">{formatRupiah(slip.netPay)}</span>
                    </p>
                  </div>
                  {slip.paidAt && (
                    <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded-lg">
                      <T>Dibayar</T> {formatDate(slip.paidAt, "Asia/Jakarta")}
                    </span>
                  )}
                </div>
                <div className="mt-3 pt-3 border-t border-gray-50 grid grid-cols-2 gap-2 text-xs text-gray-500">
                  <div><T>Gaji Pokok:</T> <span className="font-medium text-gray-700">{formatRupiah(slip.basicSalary)}</span></div>
                  <div><T>Lembur:</T> <span className="font-medium text-gray-700">{formatRupiah(slip.overtimePay)}</span></div>
                  <div><T>Makan:</T> <span className="font-medium text-gray-700">{formatRupiah(slip.mealAllowance)}</span></div>
                  <div><T>PPh 21:</T> <span className="font-medium text-red-600">-{formatRupiah(slip.pph21)}</span></div>
                </div>
                {(detailOf.get(slip.period)?.length ?? 0) > 0 && (
                  <details className="mt-3 border-t border-gray-50 pt-2 text-xs">
                    <summary className="cursor-pointer font-medium text-gray-600"><T>Rincian</T></summary>
                    <div className="mt-2 grid gap-3 sm:grid-cols-2">
                      {(["PENDAPATAN", "POTONGAN"] as const).map((k) => (
                        <div key={k}>
                          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400"><T>{k === "PENDAPATAN" ? "Pendapatan" : "Potongan"}</T></p>
                          {detailOf.get(slip.period)!.filter((i) => i.kind === k).map((i) => (
                            <p key={i.code} className="flex justify-between gap-2 py-0.5">
                              <span className="min-w-0"><span className="text-gray-700"><T>{i.name}</T></span>{i.detail && <span className="block text-[10px] text-gray-400">{i.detail}</span>}</span>
                              <span className={`shrink-0 tabular-nums ${k === "POTONGAN" ? "text-red-600" : "text-gray-800"}`}>{k === "POTONGAN" ? "-" : ""}{formatRupiah(i.amount)}</span>
                            </p>
                          ))}
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
