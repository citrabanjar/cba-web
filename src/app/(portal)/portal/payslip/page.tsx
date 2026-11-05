export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { FileText } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatRupiah } from "@/lib/utils";

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
        <h2 className="font-bold text-gray-800">Slip Gaji</h2>
        <p className="text-xs text-gray-400 mt-0.5">{session.user.name}</p>
      </div>

      <div className="max-w-3xl px-6 py-6">
        {payslips.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
            <FileText size={40} className="text-gray-200 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">Belum ada slip gaji tersedia</p>
            <p className="text-xs text-gray-400 mt-1">Slip gaji akan muncul setelah proses payroll selesai</p>
          </div>
        ) : (
          <div className="space-y-3">
            {payslips.map((slip) => (
              <div key={slip.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-gray-800 text-sm">{slip.periodLabel}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Take Home Pay: <span className="font-semibold text-[#1e3a5f]">{formatRupiah(slip.netPay)}</span>
                    </p>
                  </div>
                  {slip.paidAt && (
                    <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded-lg">
                      Dibayar {new Date(slip.paidAt).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}
                    </span>
                  )}
                </div>
                <div className="mt-3 pt-3 border-t border-gray-50 grid grid-cols-2 gap-2 text-xs text-gray-500">
                  <div>Gaji Pokok: <span className="font-medium text-gray-700">{formatRupiah(slip.basicSalary)}</span></div>
                  <div>Lembur: <span className="font-medium text-gray-700">{formatRupiah(slip.overtimePay)}</span></div>
                  <div>Makan: <span className="font-medium text-gray-700">{formatRupiah(slip.mealAllowance)}</span></div>
                  <div>PPh 21: <span className="font-medium text-red-600">-{formatRupiah(slip.pph21)}</span></div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
