export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { FileText } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatDate, formatRupiah } from "@/lib/utils";
import { T } from "@/components/i18n";

export const metadata: Metadata = { title: "Slip Gaji" };

export default async function PayslipPage() {
  const session = await auth();
  if (!session?.user) redirect("/portal");

  const payslips = await prisma.payslip.findMany({
    where: { userId: session.user.id! },
    orderBy: { period: "desc" },
  });

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
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
