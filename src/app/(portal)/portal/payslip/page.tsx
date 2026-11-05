export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, FileText } from "lucide-react";
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
    <div className="min-h-screen bg-gray-50">
      <header className="bg-[#1e3a5f] text-white px-4 py-4 flex items-center gap-3">
        <Link href="/portal/dashboard" className="p-1 hover:bg-white/10 rounded-lg transition-colors">
          <ChevronLeft size={20} />
        </Link>
        <div>
          <h1 className="font-bold text-base">Slip Gaji</h1>
          <p className="text-blue-200 text-xs">{session.user.name}</p>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6">
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
