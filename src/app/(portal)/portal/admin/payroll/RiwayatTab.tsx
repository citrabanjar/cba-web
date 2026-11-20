"use client";

import { useState } from "react";
import { ChevronRight, History } from "lucide-react";
import { T, useT } from "@/components/i18n";
import { rupiah } from "@/lib/payroll";
import { isSeparate, isWeekly } from "@/lib/payroll-run-period";
import type { Run } from "./RunTab";

type Kind = "" | "BULANAN" | "MINGGUAN" | "TERPISAH";
const kindOf = (p: string): Exclude<Kind, ""> => (isSeparate(p) ? "TERPISAH" : isWeekly(p) ? "MINGGUAN" : "BULANAN");
const KIND_LABEL: Record<Exclude<Kind, "">, string> = { BULANAN: "Bulanan", MINGGUAN: "Mingguan", TERPISAH: "THR / Bonus terpisah" };
// Tahun periode: bulanan "2026-11", mingguan "2026-11-09", terpisah "X-2026-12-20-THR".
const yearOf = (p: string) => (isSeparate(p) ? p.slice(2, 6) : p.slice(0, 4));
const stamp = (iso: string | null) => (iso ? new Date(iso).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }) : "");

// Riwayat Proses Gaji: semua periode yang pernah dihitung (terbaru di atas). Klik baris untuk membukanya di Proses Gaji.
export default function RiwayatTab({ runs, onOpen }: { runs: Run[]; onOpen: (period: string) => void }) {
  const t = useT();
  const [kind, setKind] = useState<Kind>("");
  const years = [...new Set(runs.map((r) => yearOf(r.period)))].sort().reverse();
  const [year, setYear] = useState(years[0] ?? "");
  const list = runs
    .filter((r) => (!kind || kindOf(r.period) === kind) && (!year || yearOf(r.period) === year))
    .sort((a, b) => (b.finalizedAt ?? "").localeCompare(a.finalizedAt ?? "") || b.period.localeCompare(a.period));
  // Draft di atas, lalu final terbaru.
  list.sort((a, b) => Number(a.status === "FINAL") - Number(b.status === "FINAL"));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-gray-200 bg-white p-2">
        {(["", "BULANAN", "MINGGUAN", "TERPISAH"] as Kind[]).map((k) => (
          <button key={k || "semua"} type="button" onClick={() => setKind(k)}
            className={`inline-flex h-9 items-center rounded-full px-4 text-sm ${kind === k ? "bg-ink font-semibold text-white" : "text-gray-500 hover:bg-gray-100"}`}>
            <T>{k ? KIND_LABEL[k] : "Semua"}</T>
          </button>
        ))}
        {years.length > 0 && (
          <select value={year} onChange={(e) => setYear(e.target.value)} className="ml-auto h-9 rounded-lg border border-gray-200 bg-white px-2 text-sm">
            <option value="">{t("Semua tahun")}</option>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        )}
      </div>
      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
        {list.length === 0 ? (
          <p className="flex items-center justify-center gap-2 p-10 text-sm text-gray-500"><History size={16} /> <T>Belum ada proses gaji.</T></p>
        ) : (
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-gray-50 text-left text-[10px] uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-2.5"><T>Periode</T></th>
                <th className="px-3 py-2.5"><T>Jenis</T></th>
                <th className="px-3 py-2.5 text-right"><T>Karyawan</T></th>
                <th className="px-3 py-2.5 text-right"><T>Total Gaji Bersih</T></th>
                <th className="px-3 py-2.5"><T>Status</T></th>
                <th className="px-3 py-2.5"><T>Final oleh</T></th>
                <th className="w-6" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {list.map((r) => {
                const cancelled = (r.note ?? "").includes("Final dibatalkan");
                return (
                  <tr key={r.id} onClick={() => onOpen(r.period)} className="cursor-pointer hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{r.label}</td>
                    <td className="px-3 py-3 text-gray-600"><T>{KIND_LABEL[kindOf(r.period)]}</T></td>
                    <td className="px-3 py-3 text-right tabular-nums text-gray-700">{r.lines.length}</td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums text-gray-900">{rupiah(r.lines.reduce((a, l) => a + l.netPay, 0))}</td>
                    <td className="px-3 py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${r.status === "FINAL" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}><T>{r.status === "FINAL" ? "Final" : "Draft"}</T></span>
                      {cancelled && <span title={r.note ?? ""} className="ml-1.5 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700"><T>Pernah dibatalkan</T></span>}
                    </td>
                    <td className="px-3 py-3 text-xs text-gray-500">{r.status === "FINAL" ? <>{r.finalizedBy ?? "—"}<span className="block text-[10px] text-gray-400">{stamp(r.finalizedAt)}</span></> : "—"}</td>
                    <td className="pr-3 text-gray-300"><ChevronRight size={15} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <p className="text-[11px] text-gray-400"><T>Klik satu baris untuk membuka periode itu di Proses Gaji.</T></p>
    </div>
  );
}
