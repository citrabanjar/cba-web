"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { T, useT } from "@/components/i18n";
import { formatRupiah } from "@/lib/utils";
import { LOAN_STATUS, loanSummary, periodShort } from "@/lib/loans";

export type LoanView = {
  id: string; principal: number; tenor: number; startPeriod: string; purpose: string | null; status: string;
  isOpening: boolean; originalAmount: number | null; note: string | null; createdAt: string; approvedBy: string | null;
  installments: { id: string; seq: number; period: string; amount: number; status: string; paidAt: string | null }[];
};

// Ringkasan satu pinjaman + tabel angsuran (dipakai di halaman karyawan dan admin).
export default function LoanCard({ loan, actions, header }: { loan: LoanView; actions?: React.ReactNode; header?: React.ReactNode }) {
  const t = useT();
  const [open, setOpen] = useState(loan.status === "BERJALAN");
  const s = loanSummary(loan.principal, loan.installments);
  const st = LOAN_STATUS[loan.status] ?? { label: loan.status, tone: "bg-gray-100 text-gray-600" };
  const pct = loan.principal ? Math.min(100, Math.round((s.paid / loan.principal) * 100)) : 0;
  return (
    <div className="rounded-2xl border border-gray-200 bg-white">
      <div className="flex flex-wrap items-start gap-3 p-4">
        <div className="min-w-0 flex-1">
          {header}
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-lg font-bold tabular-nums text-gray-900">{formatRupiah(loan.principal)}</p>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${st.tone}`}><T>{st.label}</T></span>
            {loan.isOpening && <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700"><T>Saldo awal migrasi</T></span>}
          </div>
          <p className="mt-0.5 text-xs text-gray-500">
            {loan.tenor} <T>kali angsuran</T> · <T>mulai</T> {periodShort(loan.startPeriod)}
            {loan.isOpening && loan.originalAmount ? <> · <T>pinjaman semula</T> {formatRupiah(loan.originalAmount)}</> : null}
          </p>
          {loan.purpose && <p className="mt-1 text-sm text-gray-700">{loan.purpose}</p>}
          {loan.note && <p className="mt-1 text-xs text-gray-500"><T>Catatan</T>: {loan.note}</p>}
        </div>
        {actions}
      </div>
      {loan.installments.length > 0 && (
        <>
          <div className="px-4">
            <div className="flex justify-between text-xs text-gray-500">
              <span><T>Sudah dibayar</T> {formatRupiah(s.paid)} ({s.paidCount}/{loan.installments.length})</span>
              <span><T>Sisa</T> <b className="text-gray-900">{formatRupiah(s.remaining)}</b></span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100"><div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} /></div>
          </div>
          <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center gap-1.5 px-4 py-2.5 text-xs font-medium text-gray-600 hover:text-gray-900">
            <ChevronDown size={14} className={`transition-transform ${open ? "rotate-180" : ""}`} /> <T>Tabel angsuran</T>
            {s.next && <span className="ml-auto text-gray-400"><T>berikutnya</T> {periodShort(s.next.period)} · {formatRupiah(s.next.amount)}</span>}
          </button>
          {open && (
            <div className="overflow-x-auto border-t border-gray-100">
              <table className="w-full text-sm">
                <thead className="bg-gray-50/70 text-left text-[10px] uppercase tracking-wide text-gray-400">
                  <tr><th className="px-4 py-2"><T>Ke-</T></th><th className="px-4 py-2"><T>Periode potongan</T></th><th className="px-4 py-2 text-right"><T>Nominal</T></th><th className="px-4 py-2 text-right"><T>Sisa setelah bayar</T></th><th className="px-4 py-2"><T>Status</T></th></tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {(() => {
                    let left = loan.principal;
                    return [...loan.installments].sort((a, b) => a.seq - b.seq).map((r) => {
                      left -= r.amount;
                      return (
                        <tr key={r.id}>
                          <td className="px-4 py-1.5 text-gray-500">{r.seq}</td>
                          <td className="px-4 py-1.5">{periodShort(r.period)}</td>
                          <td className="px-4 py-1.5 text-right tabular-nums">{formatRupiah(r.amount)}</td>
                          <td className="px-4 py-1.5 text-right tabular-nums text-gray-500">{formatRupiah(Math.max(0, left))}</td>
                          <td className="px-4 py-1.5">
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${r.status === "LUNAS" ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                              {t(r.status === "LUNAS" ? "Terpotong" : "Belum")}
                            </span>
                          </td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
