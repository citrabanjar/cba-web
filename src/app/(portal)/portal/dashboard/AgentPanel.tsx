"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowRight, BellRing, Bot, Check, Circle, Loader2 } from "lucide-react";
import { T, useT } from "@/components/i18n";
import { markReminderDone, setSetupDone } from "../admin/settings/agent-actions";
import { Row } from "./TaskPanel";
import type { Task } from "./insights";
import type { SetupStep } from "./agent";
import type { DueReminder } from "@/lib/agent-hrd";

const fmt = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("id-ID", { day: "numeric", month: "short", timeZone: "UTC" });

// Panduan Setup Awal (SOP migrasi): langkah selesai/belum terdeteksi dari data portal.
function SetupList({ steps }: { steps: SetupStep[] }) {
  const [pending, start] = useTransition();
  const required = steps.filter((s) => !s.optional);
  const done = required.filter((s) => s.done).length;
  return (
    <div className="space-y-1">
      <div className="mb-2 flex items-center gap-3 px-1">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
          <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-400" style={{ width: `${Math.round((done / required.length) * 100)}%` }} />
        </div>
        <span className="text-[11px] font-medium tabular-nums text-gray-500">{done}/{required.length} <T>langkah</T></span>
      </div>
      <div className="max-h-[19rem] overflow-y-auto pr-1">
        {steps.map((s, i) => {
          const head = i === 0 || steps[i - 1].phase !== s.phase ? s.phase : null;
          return (
            <div key={s.key}>
              {head && <p className="mt-2 px-3 text-[10px] font-semibold uppercase tracking-wide text-gray-400"><T>{head}</T></p>}
              <Link href={s.href} className="group flex items-start gap-3 rounded-xl px-3 py-2 hover:bg-gray-50">
                <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${s.done ? "bg-emerald-100 text-emerald-600" : "bg-gray-100 text-gray-400"}`}>
                  {s.done ? <Check size={13} strokeWidth={3} /> : <Circle size={10} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-sm font-semibold ${s.done ? "text-gray-500" : "text-gray-900"}`}>
                    <T>{s.title}</T>{s.optional && <span className="ml-1 text-[10px] font-normal text-gray-400">(<T>opsional</T>)</span>}
                  </span>
                  {s.note && <span className="block text-xs text-gray-500">{s.note}</span>}
                  {!s.done && <span className="block text-[11px] text-gray-400"><T>{s.hint}</T></span>}
                </span>
                {!s.done && <ArrowRight size={15} className="mt-1 shrink-0 text-gray-300 group-hover:text-brand" />}
              </Link>
            </div>
          );
        })}
      </div>
      <div className="flex justify-end pt-1">
        <button type="button" disabled={pending} onClick={() => start(async () => { await setSetupDone(true); })}
          className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50">
          {pending && <Loader2 size={12} className="animate-spin" />} <T>Setup selesai, sembunyikan panduan</T>
        </button>
      </div>
    </div>
  );
}

function ReminderList({ list }: { list: DueReminder[] }) {
  const t = useT();
  const [pending, start] = useTransition();
  if (!list.length) return <p className="py-10 text-center text-sm text-gray-400"><T>Tidak ada pengingat SOP yang jatuh tempo.</T></p>;
  return (
    <ul className="max-h-[21rem] space-y-1 overflow-y-auto pr-1">
      {list.map((r) => (
        <li key={r.id} className="flex items-start gap-3 rounded-xl px-3 py-2.5 hover:bg-gray-50">
          <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${r.daysLeft < 0 ? "bg-rose-100 text-rose-600" : "bg-sky-100 text-sky-700"}`}><BellRing size={14} /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-gray-900">{r.title}</span>
            <span className="block text-xs text-gray-500">
              {fmt(r.occurrence)} · {r.daysLeft < 0 ? `${t("lewat")} ${-r.daysLeft} ${t("hari")}` : r.daysLeft === 0 ? t("hari ini") : `${r.daysLeft} ${t("hari lagi")}`}
            </span>
            {r.note && <span className="block text-[11px] text-gray-400">{r.note}</span>}
          </span>
          <button type="button" disabled={pending} onClick={() => start(async () => { await markReminderDone(r.id, r.occurrence); })}
            className="shrink-0 rounded-full border border-gray-200 px-2.5 py-1 text-[11px] font-medium text-gray-600 hover:bg-white disabled:opacity-50">
            <T>Selesai</T>
          </button>
        </li>
      ))}
    </ul>
  );
}

// Agent HRD: memantau sistem HR dan memandu setup awal. Berbasis aturan (tanpa AI).
export default function AgentPanel({ groups, setup, reminders }: { groups: { key: string; label: string; list: Task[] }[]; setup: SetupStep[] | null; reminders: DueReminder[] }) {
  const setupLeft = setup ? setup.filter((s) => !s.optional && !s.done).length : 0;
  const tabs = [
    ...(setup ? [{ key: "setup", label: "Setup Awal", pending: setupLeft }] : []),
    ...groups.map((g) => ({ key: g.key, label: g.label, pending: g.list.filter((t) => t.count > 0).length })),
    { key: "sop", label: "Pengingat SOP", pending: reminders.length },
  ].filter((x) => x.key === "setup" || x.key === "sop" || groups.find((g) => g.key === x.key)!.list.length > 0);
  const totalPending = tabs.filter((x) => x.key !== "setup").reduce((a, x) => a + x.pending, 0);
  const [view, setView] = useState(() => (tabs.find((x) => x.pending > 0) ?? tabs[0]).key);
  const group = groups.find((g) => g.key === view);
  const list = group?.list ?? [];
  const sorted = list.filter((t) => t.count > 0);
  const doneCount = list.length - sorted.length;
  const pct = list.length ? Math.round((doneCount / list.length) * 100) : 100;
  const greeting = setup && setupLeft > 0
    ? `Setup awal tinggal ${setupLeft} langkah lagi.`
    : totalPending > 0 ? `Ada ${totalPending} hal yang perlu perhatian.` : "Semua beres, tidak ada yang terlewat.";

  return (
    <section className="relative overflow-hidden rounded-2xl border bg-white p-5">
      <div className="mb-3 flex flex-wrap items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-ink to-slate-500 text-white shadow-md shadow-black/20">
          <Bot size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-semibold text-gray-900"><T>Agent HRD</T></h3>
          <p className="truncate text-xs text-gray-500"><T>{greeting}</T></p>
        </div>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-1 rounded-2xl bg-gray-100 p-1 text-xs font-semibold">
        {tabs.map(({ key: k, label, pending: n }) => (
          <button key={k} type="button" onClick={() => setView(k)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 ${view === k ? "bg-ink text-white" : "text-gray-500 hover:text-gray-900"}`}>
            <T>{label}</T>
            {n > 0 && <span className={`rounded-full px-1.5 text-[10px] ${view === k ? "bg-white/20" : "bg-amber-100 text-amber-700"}`}>{n}</span>}
          </button>
        ))}
      </div>

      {view === "setup" && setup && <SetupList steps={setup} />}
      {view === "sop" && <ReminderList list={reminders} />}
      {group && (
        <>
          <div className="mb-3 flex items-center gap-3 px-1">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
              <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-[11px] font-medium tabular-nums text-gray-500">{doneCount}/{list.length} <T>beres</T></span>
          </div>
          {sorted.length === 0 && (
            <div className="flex h-[18rem] flex-col items-center justify-center gap-2 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600"><Check size={22} strokeWidth={3} /></span>
              <p className="text-sm font-semibold text-gray-800"><T>Semua beres</T></p>
              <p className="text-xs text-gray-400"><T>Tidak ada pekerjaan yang terlewat.</T></p>
            </div>
          )}
          {/* Berjalan ke atas seperti running text, berhenti saat disorot. */}
          <div className={`task-track -mx-2 h-[18rem] overflow-hidden ${sorted.length === 0 ? "hidden" : ""}`}>
            <div key={view} className={sorted.length > 3 ? "task-marquee" : ""} style={{ ["--marquee-duration" as string]: `${sorted.length * 4}s` }}>
              {(sorted.length > 3 ? [...sorted, ...sorted] : sorted).map((t, idx) => (
                <div key={`${t.key}-${idx}`} aria-hidden={idx >= sorted.length || undefined} className="border-b border-gray-50">
                  <Row task={t} />
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
