"use client";

import { useState } from "react";
import { FileText, Receipt } from "lucide-react";
import { T, useT } from "@/components/i18n";

export type Pph21Year = {
  year: number;
  months: { period: string; gross: number; pph21: number }[]; // Proses Gaji bulanan FINAL
  prior: { slipNumber: string; employerName: string; net: number; pph21: number }[];
  complete: boolean; // Desember / bulan keluar sudah final
};
const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const rp = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;
const sum = (xs: { gross: number; pph21: number }[], k: "gross" | "pph21") => xs.reduce((a, m) => a + m[k], 0);

// Profil karyawan → tab PPh 21: riwayat potongan PPh 21 tahunan (dengan Preview 1721-A1) dan bulanan.
export default function Pph21Card({ userId, years }: { userId: string; years: Pph21Year[] }) {
  const t = useT();
  const [year, setYear] = useState(years[0]?.year);
  const y = years.find((x) => x.year === year);
  const th = "px-3 py-2 text-right font-medium";
  return (
    <div className="space-y-5">
      {/* Tahunan */}
      <section className="rounded-2xl border border-gray-200 bg-white">
        <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 px-5 py-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-rose-400 text-white"><Receipt size={17} /></span>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-gray-900"><T>Riwayat PPh 21 Tahunan</T></h3>
            <p className="text-xs text-gray-400"><T>Dari Proses Gaji yang sudah final, ditambah PPh 21 pindahan dari pemberi kerja sebelumnya. Klik tahun untuk melihat rincian bulanan.</T></p>
          </div>
        </div>
        {years.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-gray-400"><T>Belum ada data PPh 21.</T></p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] whitespace-nowrap text-sm">
              <thead className="bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-400">
                <tr><th className="px-4 py-2 font-medium"><T>Tahun</T></th><th className="px-3 py-2 font-medium"><T>Masa</T></th><th className={th}><T>Penghasilan bruto</T></th>
                  <th className={th}><T>PPh 21 dipotong</T></th><th className="px-3 py-2 font-medium"><T>Status</T></th><th className="px-3 py-2" /></tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {years.map((x) => {
                  const on = x.year === year;
                  const first = x.months[0]?.period, last = x.months.at(-1)?.period;
                  const prior = x.prior.reduce((a, p) => a + p.pph21, 0);
                  return (
                    <tr key={x.year} onClick={() => setYear(x.year)} className={`cursor-pointer ${on ? "bg-brand/5" : "hover:bg-gray-50"}`}>
                      <td className={`px-4 py-2.5 font-semibold ${on ? "text-brand" : "text-gray-900"}`}>{x.year}</td>
                      <td className="px-3 py-2.5 text-gray-600">{first ? <>{t(MONTHS[Number(first.slice(5, 7)) - 1])}{last !== first && <> – {t(MONTHS[Number(last!.slice(5, 7)) - 1])}</>}</> : "-"}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{rp(sum(x.months, "gross"))}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{rp(sum(x.months, "pph21"))}{prior > 0 && <p className="text-[10px] text-gray-400">+ {rp(prior)} <T>pindahan</T></p>}</td>
                      <td className="px-3 py-2.5">
                        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${x.complete ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                          <T>{x.complete ? "Final" : "Berjalan"}</T>
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {/* Preview hanya bila datanya sudah ada (ada Proses Gaji final di tahun itu). */}
                        {x.months.length > 0 && (
                          <a href={`/api/pph21/a1?user=${userId}&tahun=${x.year}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                            className="inline-flex h-8 items-center gap-1.5 rounded-full bg-ink px-3 text-xs font-semibold text-white hover:bg-ink/85">
                            <FileText size={13} /> <T>Preview 1721-A1</T>
                          </a>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Bulanan tahun terpilih */}
      {y && (
        <section className="rounded-2xl border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-5 py-3">
            <h3 className="text-sm font-semibold text-gray-900"><T>Riwayat PPh 21 Bulanan</T> {y.year}</h3>
            {!y.complete && y.months.length > 0 && <p className="text-xs text-amber-700"><T>Tahun pajak belum selesai: Preview 1721-A1 bertanda SEMENTARA.</T></p>}
          </div>
          {y.months.length === 0 ? (
            <p className="px-5 py-6 text-center text-sm text-gray-400"><T>Belum ada Proses Gaji final di tahun ini.</T></p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full whitespace-nowrap text-sm">
                <thead className="bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-400">
                  <tr><th className="px-4 py-2 font-medium"><T>Masa</T></th><th className={th}><T>Penghasilan bruto</T></th><th className={th}><T>PPh 21 dipotong</T></th></tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {y.months.map((m) => (
                    <tr key={m.period}><td className="px-4 py-2">{t(MONTHS[Number(m.period.slice(5, 7)) - 1])} {m.period.slice(0, 4)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{rp(m.gross)}</td><td className="px-3 py-2 text-right tabular-nums">{rp(m.pph21)}</td></tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-gray-200 bg-gray-50 font-semibold"><tr><td className="px-4 py-2"><T>Total</T></td>
                  <td className="px-3 py-2 text-right tabular-nums">{rp(sum(y.months, "gross"))}</td><td className="px-3 py-2 text-right tabular-nums">{rp(sum(y.months, "pph21"))}</td></tr></tfoot>
              </table>
            </div>
          )}
          {y.prior.length > 0 && (
            <div className="border-t border-gray-100 px-5 py-3">
              <p className="text-xs font-semibold text-gray-700"><T>PPh 21 pindahan (BPA1 pemberi kerja sebelumnya)</T></p>
              {y.prior.map((p) => (
                <p key={p.slipNumber} className="mt-1 text-xs text-gray-600">BPA1 {p.slipNumber}{p.employerName && <> · {p.employerName}</>} · <T>neto</T> {rp(p.net)} · PPh {rp(p.pph21)}</p>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
