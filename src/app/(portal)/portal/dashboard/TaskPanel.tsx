"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, ListChecks } from "lucide-react";
import { T } from "@/components/i18n";
import type { Task } from "./insights";

function Row({ task }: { task: Task }) {
  const done = task.count === 0;
  const body = (
    <>
      <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${done ? "bg-emerald-100 text-emerald-600" : "bg-amber-100 text-amber-700"}`}>
        {done ? <Check size={15} strokeWidth={3} /> : <span className="text-[11px] font-bold tabular-nums">{task.count > 99 ? "99+" : task.count}</span>}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block text-sm font-semibold ${done ? "text-gray-400 line-through decoration-gray-300" : "text-gray-900"}`}>
          <T>{task.title}</T>
        </span>
        <span className="block text-xs text-gray-500">
          {done ? <T>Beres</T> : (
            <>
              <b className="text-gray-700">{task.count}</b> <T>{task.unit}</T>
              {task.extra && <> · <b className="text-gray-700">{task.extra.count}</b> <T>{task.extra.unit}</T></>}
            </>
          )}
        </span>
        {!done && <span className="mt-0.5 block text-[11px] text-gray-400"><T>{task.hint}</T></span>}
      </span>
      {task.href && !done && <ArrowRight size={15} className="mt-1 shrink-0 text-gray-300 transition-colors group-hover:text-brand" />}
    </>
  );
  const cls = "group flex items-start gap-3 rounded-xl px-3 py-2.5";
  return task.href && !done
    ? <Link href={task.href} className={`${cls} hover:bg-gray-50`}>{body}</Link>
    : <div className={cls}>{body}</div>;
}

// Kartu besar Beranda: daftar pekerjaan admin harian dan bulanan, supaya tidak ada yang terlewat.
// Tugas yang belum selesai di atas; yang sudah beres dicoret di bawah.
export default function TaskPanel({ daily, monthly }: { daily: Task[]; monthly: Task[] }) {
  const pendingDaily = daily.filter((t) => t.count > 0).length;
  const pendingMonthly = monthly.filter((t) => t.count > 0).length;
  // Buka tab yang masih ada pekerjaannya.
  const [view, setView] = useState<"daily" | "monthly">(pendingDaily === 0 && pendingMonthly > 0 ? "monthly" : "daily");
  const list = view === "daily" ? daily : monthly;
  const sorted = [...list.filter((t) => t.count > 0), ...list.filter((t) => t.count === 0)];
  const doneCount = list.length - (view === "daily" ? pendingDaily : pendingMonthly);
  const pct = list.length ? Math.round((doneCount / list.length) * 100) : 100;

  return (
    <section className="relative overflow-hidden rounded-2xl border bg-white p-5">
      <div className="mb-3 flex flex-wrap items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-rose-400 text-white shadow-md shadow-brand/30">
          <ListChecks size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-semibold text-gray-900"><T>Tugas Admin</T></h3>
          <p className="truncate text-xs text-gray-400"><T>Pekerjaan yang perlu diselesaikan supaya tidak ada yang terlewat</T></p>
        </div>
        <div className="flex items-center gap-1 rounded-full bg-gray-100 p-1 text-xs font-semibold">
          {([["daily", "Harian", pendingDaily], ["monthly", "Bulanan", pendingMonthly]] as const).map(([k, label, n]) => (
            <button key={k} type="button" onClick={() => setView(k)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 ${view === k ? "bg-ink text-white" : "text-gray-500 hover:text-gray-900"}`}>
              <T>{label}</T>
              {n > 0 && <span className={`rounded-full px-1.5 text-[10px] ${view === k ? "bg-white/20" : "bg-amber-100 text-amber-700"}`}>{n}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-3 flex items-center gap-3 px-1">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
          <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-[11px] font-medium tabular-nums text-gray-500">{doneCount}/{list.length} <T>beres</T></span>
      </div>

      {/* Daftar tugas berjalan ke atas seperti running text, berhenti saat disorot.
          Digandakan supaya putarannya menyambung tanpa jeda. */}
      <div className="task-track -mx-2 h-[21rem] overflow-hidden">
        <div key={view} className={sorted.length > 3 ? "task-marquee" : ""}
          style={{ ["--marquee-duration" as string]: `${sorted.length * 4}s` }}>
          {(sorted.length > 3 ? [...sorted, ...sorted] : sorted).map((t, idx) => (
            <div key={`${t.key}-${idx}`} aria-hidden={idx >= sorted.length || undefined} className="border-b border-gray-50">
              <Row task={t} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
