"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowRight, BellRing, Bot, Check, Circle, ClipboardList, Loader2 } from "lucide-react";
import { T, useT } from "@/components/i18n";
import { markReminderDone, setSetupDone } from "../admin/settings/agent-actions";
import { Row } from "./TaskPanel";
import type { Task } from "./insights";
import type { AiFindingView, SetupStep } from "./agent";
import { resolveAiFinding } from "../admin/settings/ai-actions";
import { AI_AREAS, AI_SEVERITY } from "@/lib/ai-checker-settings";
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

// Pengingat SOP sebagai satu baris di running list, dengan tombol Selesai.
function ReminderRow({ r }: { r: DueReminder }) {
  const t = useT();
  const [pending, start] = useTransition();
  return (
    <div className="flex items-start gap-3 rounded-xl px-3 py-2.5">
      <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${r.daysLeft < 0 ? "bg-rose-100 text-rose-600" : "bg-sky-100 text-sky-700"}`}><BellRing size={14} /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-gray-900">{r.title} <Tag label="SOP" /></span>
        <span className="block text-xs text-gray-500">
          {fmt(r.occurrence)} · {r.daysLeft < 0 ? `${t("lewat")} ${-r.daysLeft} ${t("hari")}` : r.daysLeft === 0 ? t("hari ini") : `${r.daysLeft} ${t("hari lagi")}`}
        </span>
        {r.note && <span className="block text-[11px] text-gray-400">{r.note}</span>}
      </span>
      <button type="button" disabled={pending} onClick={() => start(async () => { await markReminderDone(r.id, r.occurrence); })}
        className="shrink-0 rounded-full border border-gray-200 px-2.5 py-1 text-[11px] font-medium text-gray-600 hover:bg-white disabled:opacity-50">
        <T>Selesai</T>
      </button>
    </div>
  );
}

// Temuan AI: tombol Selesai, atau Bukan masalah + alasan (disimpan ke catatan belajar AI).
function AiRow({ f }: { f: AiFindingView }) {
  const t = useT();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const sev = AI_SEVERITY[f.severity] ?? AI_SEVERITY.RENDAH;
  const resolve = (notIssue: boolean) => start(async () => {
    const r = await resolveAiFinding(f.id, notIssue, reason);
    if (r.error) setError(r.error);
  });
  return (
    <div className="flex items-start gap-3 rounded-xl px-3 py-2.5">
      <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${sev.tone}`}><Bot size={14} /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-gray-900">
          {f.href ? <Link href={f.href} className="hover:underline">{f.title}</Link> : f.title} <Tag label="AI" /> <Tag label={AI_AREAS[f.area] ?? f.area} />
        </span>
        <span className="block text-xs text-gray-500">{f.detail}</span>
        {f.employeeIds.length > 1 && <span className="block text-[11px] text-gray-400">{f.employeeIds.join(", ")}</span>}
        {open && (
          <span className="mt-1.5 flex gap-1.5">
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("Alasan bukan masalah")}
              className="h-7 min-w-0 flex-1 rounded-lg border border-gray-200 px-2 text-xs" />
            <button type="button" disabled={pending} onClick={() => resolve(true)}
              className="shrink-0 rounded-full bg-ink px-2.5 text-[11px] font-medium text-white disabled:opacity-50"><T>Simpan</T></button>
          </span>
        )}
        {error && <span className="block text-[11px] text-rose-600"><T>{error}</T></span>}
      </span>
      <span className="flex shrink-0 flex-col gap-1">
        <button type="button" disabled={pending} onClick={() => resolve(false)}
          className="rounded-full border border-gray-200 px-2.5 py-1 text-[11px] font-medium text-gray-600 hover:bg-white disabled:opacity-50"><T>Selesai</T></button>
        <button type="button" disabled={pending} onClick={() => setOpen((v) => !v)}
          className="rounded-full px-2.5 py-1 text-[11px] font-medium text-gray-400 hover:text-gray-700"><T>Bukan masalah</T></button>
      </span>
    </div>
  );
}

const Tag = ({ label }: { label: string }) => (
  <span className="ml-1 rounded-full bg-gray-100 px-1.5 py-0.5 align-middle text-[9px] font-semibold uppercase tracking-wide text-gray-500"><T>{label}</T></span>
);

// Task Admin: satu running list semua pekerjaan yang belum beres; admin memilih sendiri mana yang dikerjakan dulu.
// Berbasis aturan (tanpa AI). Super Admin juga melihat panduan Setup Awal sampai ditandai selesai.
export default function AgentPanel({ groups, setup, reminders, ai = [] }: { groups: { key: string; label: string; list: Task[] }[]; setup: SetupStep[] | null; reminders: DueReminder[]; ai?: AiFindingView[] }) {
  const setupLeft = setup ? setup.filter((s) => !s.optional && !s.done).length : 0;
  const [showSetup, setShowSetup] = useState(false);
  const items = [
    ...ai.map((f) => ({ key: `ai-${f.id}`, node: <AiRow f={f} /> })),
    ...groups.flatMap((g) => g.list.filter((t) => t.count > 0).map((t) => ({ key: `${g.key}-${t.key}`, node: <Row task={t} tag={<Tag label={g.label} />} /> }))),
    ...reminders.map((r) => ({ key: `sop-${r.id}`, node: <ReminderRow r={r} /> })),
  ];
  const total = items.length;
  const anyCheck = groups.some((g) => g.list.length > 0) || ai.length > 0;
  const run = total > 3;
  const greeting = setup && setupLeft > 0
    ? `Setup awal tinggal ${setupLeft} langkah lagi.`
    : total > 0 ? `Ada ${total} hal yang perlu perhatian.` : anyCheck ? "Semua beres, tidak ada yang terlewat." : "Belum ada pengecekan yang dinyalakan.";

  return (
    <section className="relative overflow-hidden rounded-2xl border bg-white p-5">
      <div className="mb-3 flex flex-wrap items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-ink to-slate-500 text-white shadow-md shadow-black/20">
          <ClipboardList size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-semibold text-gray-900"><T>Task Admin</T></h3>
          <p className="truncate text-xs text-gray-500"><T>{greeting}</T></p>
        </div>
        {setup && (
          <button type="button" onClick={() => setShowSetup((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${showSetup ? "bg-ink text-white" : "bg-gray-100 text-gray-600 hover:text-gray-900"}`}>
            {showSetup ? <T>Kembali ke daftar tugas</T> : <><T>Setup Awal</T>{setupLeft > 0 && <span className="rounded-full bg-amber-100 px-1.5 text-[10px] text-amber-700">{setupLeft}</span>}</>}
          </button>
        )}
      </div>

      {showSetup && setup ? <SetupList steps={setup} /> : total === 0 && !anyCheck ? (
        <div className="flex h-[18rem] flex-col items-center justify-center gap-2 px-6 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-400"><ClipboardList size={22} /></span>
          <p className="text-sm font-semibold text-gray-800"><T>Belum ada pengecekan yang dinyalakan.</T></p>
          <p className="text-xs text-gray-400"><T>Admin bisa menyalakannya di Pengaturan, tab Task Admin.</T></p>
        </div>
      ) : total === 0 ? (
        <div className="flex h-[18rem] flex-col items-center justify-center gap-2 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600"><Check size={22} strokeWidth={3} /></span>
          <p className="text-sm font-semibold text-gray-800"><T>Semua beres</T></p>
          <p className="text-xs text-gray-400"><T>Tidak ada pekerjaan yang terlewat.</T></p>
        </div>
      ) : (
        // Berjalan ke atas seperti running text, berhenti saat disorot supaya admin bisa memilih.
        <div className="task-track -mx-2 h-[20rem] overflow-hidden">
          <div className={run ? "task-marquee" : ""} style={{ ["--marquee-duration" as string]: `${total * 4}s` }}>
            {(run ? [...items, ...items] : items).map((it, idx) => (
              <div key={`${it.key}-${idx}`} aria-hidden={idx >= total || undefined} inert={idx >= total || undefined} className="border-b border-gray-50">
                {it.node}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
