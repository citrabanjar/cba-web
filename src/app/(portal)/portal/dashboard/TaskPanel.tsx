"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, ListChecks } from "lucide-react";
import { T } from "@/components/i18n";
import type { Task } from "./insights";

export function Row({ task, tag }: { task: Task; tag?: React.ReactNode }) {
  const done = task.count === 0;
  const body = (
    <>
      <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${done ? "bg-emerald-100 text-emerald-600" : "bg-amber-100 text-amber-700"}`}>
        {done ? <Check size={15} strokeWidth={3} /> : <span className="text-[11px] font-bold tabular-nums">{task.count > 99 ? "99+" : task.count}</span>}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block text-sm font-semibold ${done ? "text-gray-400 line-through decoration-gray-300" : "text-gray-900"}`}>
          <T>{task.title}</T>{tag}
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
export default function TaskPanel({ daily, monthly, data }: { daily: Task[]; monthly: Task[]; data: Task[] }) {
  const tabs = [
    { key: "daily", label: "Harian", list: daily },
    { key: "monthly", label: "Bulanan", list: monthly },
    { key: "data", label: "Data Karyawan", list: data },
  ].map((x) => ({ ...x, pending: x.list.filter((t) => t.count > 0).length }));
  // Buka tab pertama yang masih ada pekerjaannya.
  const [view, setView] = useState(() => (tabs.find((x) => x.pending > 0) ?? tabs[0]).key);
  const current = tabs.find((x) => x.key === view) ?? tabs[0];
  const list = current.list;
  // Yang berjalan hanya tugas yang belum beres; yang sudah beres hilang dari daftar.
  const sorted = list.filter((t) => t.count > 0);
  const doneCount = list.length - current.pending;
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
          {tabs.map(({ key: k, label, pending: n }) => (
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
      {sorted.length === 0 && (
        <div className="flex h-[21rem] flex-col items-center justify-center gap-2 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600"><Check size={22} strokeWidth={3} /></span>
          <p className="text-sm font-semibold text-gray-800"><T>Semua tugas beres</T></p>
          <p className="text-xs text-gray-400"><T>Tidak ada pekerjaan yang terlewat.</T></p>
        </div>
      )}
      <div className={`task-track -mx-2 h-[21rem] overflow-hidden ${sorted.length === 0 ? "hidden" : ""}`}>
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
