"use client";

import { Hourglass, Wallet } from "lucide-react";
import { T } from "@/components/i18n";
import type { BalanceRow } from "@/lib/leave-balance";

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, ""));

// Kartu saldo cuti (Cuti Tahunan / Cuti Masa Kontrak) di halaman Pengajuan Cuti — hanya saldo;
// riwayat saldo ada di Profil Saya → Kehadiran → Saldo Cuti.
export default function LeaveBalanceCard({ rows, compact = false }: { rows: BalanceRow[]; compact?: boolean }) {
  if (rows.length === 0) return null;
  return (
    <div className={`grid gap-3 ${compact ? "" : "sm:grid-cols-2"}`}>
      {rows.map((r) => {
        const available = Math.round((r.balance - r.pending) * 100) / 100;
        return (
          <section key={r.policyId} className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
            <div className="p-4">
              <div className="flex items-start gap-3">
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white ${r.code === "CMK" ? "bg-gradient-to-br from-sky-500 to-indigo-400" : "bg-gradient-to-br from-emerald-500 to-teal-400"}`}>
                  <Wallet size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400"><T>Saldo</T> {r.code}</p>
                  <p className="truncate text-sm font-semibold text-gray-800"><T>{r.policyName}</T></p>
                </div>
                <div className="text-right">
                  <p className="text-3xl font-bold leading-none tabular-nums text-gray-900">{fmt(r.balance)}</p>
                  <p className="mt-1 text-[11px] text-gray-400"><T>hari</T></p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                {r.pending > 0 && (
                  <span className="flex items-center gap-1 text-amber-700"><Hourglass size={12} /> {fmt(r.pending)} <T>hari menunggu persetujuan</T> · <T>bisa diajukan</T> {fmt(available)}</span>
                )}
                {r.problem && <span className="text-red-600"><T>{r.problem}</T> — <T>hubungi HRD</T></span>}
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}
