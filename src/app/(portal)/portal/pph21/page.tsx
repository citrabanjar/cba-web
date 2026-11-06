export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Receipt } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatRupiah } from "@/lib/utils";
import { T } from "@/components/i18n";

export const metadata: Metadata = { title: "PPh 21" };

export default async function Pph21Page() {
  const session = await auth();
  if (!session?.user) redirect("/portal");

  const payslips = await prisma.payslip.findMany({
    where: {
      userId: session.user.id!,
      pph21: { gt: 0 },
    },
    orderBy: { period: "desc" },
  });

  const totalPph21 = payslips.reduce((sum, s) => sum + (s.pph21 ?? 0), 0);

  return (
    <div className="bg-gray-50 min-h-full">
      <div className="px-6 py-4 border-b border-gray-100 bg-white">
        <h2 className="font-bold text-gray-800"><T>PPh 21</T></h2>
        <p className="text-xs text-gray-400 mt-0.5">{session.user.name}</p>
      </div>

      <div className="max-w-3xl px-6 py-6 space-y-4">

        {payslips.length > 0 && (
          <div className="bg-ink rounded-2xl p-5 text-white">
            <p className="text-gray-300 text-xs"><T>Total PPh 21 Tahun Ini</T></p>
            <p className="text-2xl font-bold mt-1">{formatRupiah(totalPph21)}</p>
            <p className="text-gray-300 text-xs mt-1">{payslips.length} <T>bulan terpotong</T></p>
          </div>
        )}

        {payslips.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
            <Receipt size={40} className="text-gray-200 mx-auto mb-3" />
            <p className="text-gray-500 font-medium"><T>Belum ada data PPh 21</T></p>
            <p className="text-xs text-gray-400 mt-1"><T>Data PPh 21 akan muncul setelah proses payroll selesai</T></p>
          </div>
        ) : (
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3"><T>Rincian Per Bulan</T></p>
            <div className="space-y-3">
              {payslips.map((slip) => (
                <div key={slip.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-gray-800 text-sm">{slip.periodLabel}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      <T>PPh 21:</T> <span className="font-semibold text-red-600">{formatRupiah(slip.pph21 ?? 0)}</span>
                    </p>
                  </div>
                  <span className="text-xs text-gray-400 bg-gray-50 px-3 py-2 rounded-xl"><T>Dipotong otomatis</T></span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-gray-100 rounded-2xl p-4 text-xs text-gray-700">
          <p className="font-semibold mb-1"><T>Informasi PPh 21</T></p>
          <p><T>Pajak Penghasilan Pasal 21 (PPh 21) dipotong langsung dari gaji setiap bulan oleh perusahaan dan disetorkan ke kas negara. Simpan data ini untuk pelaporan SPT Tahunan Anda.</T></p>
        </div>
      </div>
    </div>
  );
}
