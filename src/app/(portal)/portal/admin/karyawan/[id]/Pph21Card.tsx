"use client";

import { useState } from "react";
import { FileText, Receipt } from "lucide-react";
import { T, useT } from "@/components/i18n";

export type Pph21Year = {
  year: number;
  months: { period: string; gross: number; pph21: number }[]; // Proses Gaji bulanan FINAL
  prior: { slipNumber: string; kind: string; employerName: string; monthFrom: number; monthTo: number; gross: number; pph21: number }[];
  complete: boolean; // Desember / bulan keluar sudah final
};
const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const rp = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;

// Profil karyawan → Payroll: data PPh 21 per tahun (hanya tampil) dan tombol Preview 1721-A1 (PDF).
export default function Pph21Card({ userId, years }: { userId: string; years: Pph21Year[] }) {
  const t = useT();
  const [year, setYear] = useState(years[0]?.year);
  const y = years.find((x) => x.year === year);
  const total = (k: "gross" | "pph21") => (y?.months.reduce((a, m) => a + m[k], 0) ?? 0);
  return (
    <section className="rounded-2xl border border-gray-200 bg-white">
      <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 px-5 py-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-rose-400 text-white"><Receipt size={17} /></span>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-gray-900"><T>PPh 21</T></h3>
          <p className="text-xs text-gray-400"><T>Penghasilan bruto dan PPh 21 dari Proses Gaji yang sudah final, ditambah bukti potong pemberi kerja sebelumnya.</T></p>
        </div>
        {years.length > 1 && (
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="h-9 rounded-lg border border-gray-300 bg-white px-2 text-sm">
            {years.map((x) => <option key={x.year} value={x.year}>{x.year}</option>)}
          </select>
        )}
        {/* Preview hanya bila datanya sudah ada (ada Proses Gaji final di tahun itu). */}
        {y && y.months.length > 0 && (
          <a href={`/api/pph21/a1?user=${userId}&tahun=${y.year}`} target="_blank" rel="noreferrer"
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-ink px-4 text-xs font-semibold text-white hover:bg-ink/85">
            <FileText size={14} /> <T>Preview 1721-A1</T>
          </a>
        )}
      </div>
      {!y || (y.months.length === 0 && y.prior.length === 0) ? (
        <p className="px-5 py-8 text-center text-sm text-gray-400"><T>Belum ada data PPh 21.</T></p>
      ) : (
        <div className="space-y-3 p-5">
          {!y.complete && y.months.length > 0 && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800"><T>Tahun pajak belum selesai: Preview 1721-A1 bertanda SEMENTARA.</T></p>}
          {y.months.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="w-full whitespace-nowrap text-sm">
                <thead className="bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-400">
                  <tr><th className="px-4 py-2"><T>Masa</T></th><th className="px-3 py-2 text-right"><T>Penghasilan bruto</T></th><th className="px-3 py-2 text-right"><T>PPh 21 dipotong</T></th></tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {y.months.map((m) => (
                    <tr key={m.period}><td className="px-4 py-2">{t(MONTHS[Number(m.period.slice(5, 7)) - 1])} {m.period.slice(0, 4)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{rp(m.gross)}</td><td className="px-3 py-2 text-right tabular-nums">{rp(m.pph21)}</td></tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-gray-200 bg-gray-50 font-semibold"><tr><td className="px-4 py-2"><T>Total</T></td>
                  <td className="px-3 py-2 text-right tabular-nums">{rp(total("gross"))}</td><td className="px-3 py-2 text-right tabular-nums">{rp(total("pph21"))}</td></tr></tfoot>
              </table>
            </div>
          )}
          {y.prior.length > 0 && (
            <div className="rounded-xl border border-gray-200 p-3">
              <p className="text-xs font-semibold text-gray-700"><T>Bukti potong pemberi kerja sebelumnya</T></p>
              {y.prior.map((p) => (
                <p key={p.slipNumber} className="mt-1 text-xs text-gray-600">
                  {p.slipNumber} ({p.kind}) · {p.employerName} · {t(MONTHS[p.monthFrom - 1])}{p.monthTo !== p.monthFrom && <> – {t(MONTHS[p.monthTo - 1])}</>} · <T>bruto</T> {rp(p.gross)} · PPh {rp(p.pph21)}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
