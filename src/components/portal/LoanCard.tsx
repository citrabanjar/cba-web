"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { T, useT } from "@/components/i18n";
import { formatRupiah } from "@/lib/utils";
import { LOAN_STAGE, LOAN_STATUS, loanStageOf, loanSummary, periodShort, type LoanFlow, type LoanPlan } from "@/lib/loans";

export type LoanView = {
  id: string; seqNo: number; disbursedAt: string | null; principal: number; tenor: number; startPeriod: string; purpose: string | null; status: string;
  isOpening: boolean; originalAmount: number | null; note: string | null; createdAt: string; approvedBy: string | null; approvedAt?: string | null;
  stage?: string | null; flow?: LoanFlow; // alur pengajuan (status PENDING)
  installments: { id: string; seq: number; period: string; amount: number; status: string; paidAt: string | null }[];
};

// Ringkasan satu pinjaman + tabel angsuran (dipakai di halaman karyawan dan admin).
// processOnly: keperluan, catatan, dan jejak approval hanya tampil selama pengajuan berproses (menunggu / ditolak);
// pinjaman yang sudah disetujui cukup ringkasan dan tabel angsuran (halaman karyawan).
export default function LoanCard({ loan, actions, header, processOnly = false }: { loan: LoanView; actions?: React.ReactNode; header?: React.ReactNode; processOnly?: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(loan.status === "BERJALAN");
  const s = loanSummary(loan.principal, loan.installments);
  const stage = loanStageOf(loan.status, loan.stage);
  const st = stage ? { label: LOAN_STAGE[stage], tone: LOAN_STATUS.PENDING.tone } : LOAN_STATUS[loan.status] ?? { label: loan.status, tone: "bg-gray-100 text-gray-600" };
  const pct = loan.principal ? Math.min(100, Math.round((s.paid / loan.principal) * 100)) : 0;
  return (
    <div className="rounded-2xl border border-gray-200 bg-white">
      <div className="flex flex-wrap items-start gap-3 p-4">
        <div className="min-w-0 flex-1">
          {header}
          <div className="flex flex-wrap items-center gap-2">
            {loan.seqNo > 0 && <span className="rounded-md bg-ink px-1.5 py-0.5 text-[10px] font-bold text-white"><T>Pinjaman ke-</T>{loan.seqNo}</span>}
            <p className="text-lg font-bold tabular-nums text-gray-900">{formatRupiah(loan.principal)}</p>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${st.tone}`}><T>{st.label}</T></span>
            {loan.isOpening && <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700"><T>Saldo awal migrasi</T></span>}
          </div>
          <p className="mt-0.5 text-xs text-gray-500">
            {loan.tenor} <T>kali angsuran</T> · <T>mulai</T> {periodShort(loan.startPeriod)}
            {loan.isOpening && loan.originalAmount ? <> · <T>pinjaman semula</T> {formatRupiah(loan.originalAmount)}</> : null}
            {!loan.isOpening && loan.originalAmount ? <> · <T>dana baru</T> {formatRupiah(loan.originalAmount)}</> : null}
            {loan.disbursedAt && <> · <T>dicairkan</T> {new Date(`${loan.disbursedAt}T00:00:00Z`).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}</>}
          </p>
          {(!processOnly || ["PENDING", "DITOLAK", "BATAL"].includes(loan.status)) && <>
            {loan.purpose && <p className="mt-1 text-sm text-gray-700">{loan.purpose}</p>}
            {loan.note && <p className="mt-1 text-xs text-gray-500"><T>Catatan</T>: {loan.note}</p>}
            {loan.status === "PENDING" && loan.flow?.request && <LoanRequestSummary plan={loan.flow.request} />}
            {(loan.flow?.managerName || loan.flow?.workflow || loan.flow?.topName) && <LoanTrail flow={loan.flow} status={loan.status} stage={stage} />}
          </>}
        </div>
        {actions}
      </div>
      {loan.installments.length > 0 && (
        <>
          <div className="px-4">
            <div className="flex justify-between text-xs text-gray-500">
              <span><T>Sudah dibayar</T> {formatRupiah(s.paid)} ({s.paidCount}/{loan.installments.length})</span>
              {loan.status === "DIGABUNG"
                ? <span><T>Sisa dipindah ke pinjaman gabungan</T></span>
                : <span><T>Sisa</T> <b className="text-gray-900">{formatRupiah(s.remaining)}</b></span>}
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100"><div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} /></div>
          </div>
          <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center gap-1.5 px-4 py-2.5 text-xs font-medium text-gray-600 hover:text-gray-900">
            <ChevronDown size={14} className={`transition-transform ${open ? "rotate-180" : ""}`} /> <T>Tabel angsuran</T>
            {s.next && <span className="ml-auto text-gray-400"><T>berikutnya</T> {periodShort(s.next.period)} · {formatRupiah(s.next.amount)}</span>}
          </button>
          {open && (
            <div className="max-h-96 overflow-auto border-t border-gray-100">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-gray-50 text-left text-[10px] uppercase tracking-wide text-gray-400">
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

// Jejak pengajuan: atasan langsung (atau level Workflow) → pemeriksaan Admin → pimpinan puncak (atau level terakhir Workflow).
export function LoanTrail({ flow: f, status, stage }: { flow: LoanFlow; status: string; stage: string | null }) {
  const t = useT();
  const rejected = status === "DITOLAK";
  const early = f.pre
    ? f.pre.map((x, n) => ({ key: `pre${n}`, label: `${t("Level")} ${n + 1}`, name: x.by && x.by !== x.name ? `${x.name} (${x.by})` : x.name, done: x.decision === "SETUJU", no: x.decision === "TOLAK" }))
    : f.managerName ? [{ key: "atasan", label: t("Atasan langsung"), name: f.managerName, done: !!f.managerAt && !(rejected && !f.adminAt), no: rejected && !!f.managerAt && !f.adminAt }]
    : []; // atasan langsung = pimpinan puncak: tanpa tahap atasan
  const steps = [
    ...early,
    { key: "admin", label: t(f.checkName ? "Pemeriksa dokumen" : "Pemeriksaan Admin"), name: f.adminName ?? f.checkName, done: !!f.adminAt, no: false },
    { key: "top", label: f.workflow ? `${t("Level")} ${early.length + 1}` : t("Pimpinan puncak"), name: f.topBy && f.topBy !== f.topName ? `${f.topName} (${f.topBy})` : f.topName, done: !!f.topAt && !rejected, no: rejected && !!f.topAt },
  ];
  const current = stage === "ATASAN" ? steps.find((x) => !x.done)?.key : stage === "ADMIN" ? "admin" : stage === "PIMPINAN" ? "top" : null;
  return (
    <p className="mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-gray-500">
      {steps.map((x, n) => (
        <span key={x.key} className={x.done ? "text-emerald-700" : x.no ? "text-rose-700" : x.key === current ? "font-semibold text-amber-700" : ""}>
          {x.label}{x.name ? ` · ${x.name}` : ""} {x.done ? "✓" : x.no ? "✗" : "…"}{n < steps.length - 1 && " →"}
        </span>
      ))}
    </p>
  );
}

// Permohonan karyawan saat masih ada pinjaman berjalan: hitung ulang angsuran (digabung) atau tambahan potongan per bulan.
export function LoanRequestSummary({ plan: p }: { plan: LoanPlan }) {
  const merged = p.mergeIds.length > 0;
  return (
    <div className="mt-2 space-y-1 rounded-lg border border-indigo-100 bg-indigo-50/50 px-3 py-2 text-xs text-gray-700">
      <p className="font-semibold text-indigo-900"><T>{merged ? "Permohonan hitung ulang angsuran" : "Masih ada pinjaman berjalan"}</T></p>
      {merged && (
        <>
          <p className="text-[11px] text-gray-500"><T>Digabung</T>: {p.merged.join(", ")} + <T>pinjaman baru</T> {formatRupiah(p.principal)}</p>
          <p className="flex justify-between gap-2"><span><T>Total pinjaman gabungan</T></span><b>{formatRupiah(p.total)}</b></p>
          <p className="flex justify-between gap-2"><span><T>Angsuran yang diminta</T></span><span><b>{formatRupiah(p.first)}</b><T>/bulan</T> x {p.count} · {periodShort(p.startPeriod)} – {periodShort(p.endPeriod)}</span></p>
          {p.last !== p.first && <p className="text-right text-[11px] text-gray-500"><T>angsuran terakhir</T> {formatRupiah(p.last)}</p>}
        </>
      )}
      <p className="flex justify-between gap-2 rounded-md bg-amber-50 px-2 py-1 text-amber-900"><span><T>Total potongan pinjaman per bulan</T></span><span>{formatRupiah(p.before)} → <b>{formatRupiah(p.after)}</b></span></p>
    </div>
  );
}
