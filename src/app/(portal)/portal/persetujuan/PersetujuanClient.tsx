"use client";

import { useState, useTransition } from "react";
import { Briefcase, Calendar, Check, Inbox, Loader2, X } from "lucide-react";
import { T, useT } from "@/components/i18n";
import { formatDate } from "@/lib/utils";
import { halfDayLabel } from "@/lib/leave";
import { decideLeave, decideTrip } from "./actions";

export type ApprovalItem = {
  id: string; kind: "CUTI" | "DINAS"; status: string;
  person: { name: string; employeeId: string | null; position: string | null; department: string | null };
  title: string; start: string; end: string; days: number; halfDay: string | null; unpaidDays: number;
  reason: string; note: string | null; decidedBy: string | null; decidedAt: string | null; createdAt: string;
};

const STATUS: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "Menunggu", cls: "bg-amber-100 text-amber-700" },
  APPROVED: { label: "Disetujui", cls: "bg-emerald-100 text-emerald-700" },
  REJECTED: { label: "Ditolak", cls: "bg-rose-100 text-rose-700" },
};
const dec = (n: number) => String(n).replace(".", ",");

export default function PersetujuanClient({ items }: { items: ApprovalItem[] }) {
  const [tab, setTab] = useState<"menunggu" | "riwayat">("menunggu");
  const pending = items.filter((i) => i.status === "PENDING").sort((a, b) => a.start.localeCompare(b.start));
  const done = items.filter((i) => i.status !== "PENDING").sort((a, b) => (b.decidedAt ?? "").localeCompare(a.decidedAt ?? ""));
  const list = tab === "menunggu" ? pending : done;
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
      <div className="flex gap-1 rounded-2xl border border-gray-200 bg-white p-1.5">
        {([["menunggu", "Menunggu", pending.length], ["riwayat", "Riwayat 60 hari", done.length]] as const).map(([k, l, n]) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            className={`inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full px-4 text-sm ${tab === k ? "bg-ink font-semibold text-white" : "text-gray-500 hover:bg-gray-100"}`}>
            <T>{l}</T> <span className="text-xs opacity-70">{n}</span>
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-gray-300 bg-white/70 p-10 text-center">
          <Inbox size={22} className="text-gray-300" />
          <p className="text-sm text-gray-500"><T>{tab === "menunggu" ? "Tidak ada pengajuan yang menunggu persetujuan Anda." : "Belum ada riwayat."}</T></p>
        </div>
      ) : list.map((i) => <Card key={`${i.kind}-${i.id}`} item={i} />)}
    </div>
  );
}

function Card({ item: i }: { item: ApprovalItem }) {
  const t = useT();
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [error, setError] = useState("");
  const st = STATUS[i.status] ?? { label: i.status, cls: "bg-gray-100 text-gray-600" };
  const Icon = i.kind === "CUTI" ? Calendar : Briefcase;
  const decide = (approve: boolean) => start(async () => {
    setError("");
    const fn = i.kind === "CUTI" ? decideLeave : decideTrip;
    const r = await fn(i.id, approve, note);
    if (r.error) setError(r.error);
  });
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-start gap-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${i.kind === "CUTI" ? "bg-violet-100 text-violet-700" : "bg-sky-100 text-sky-700"}`}><Icon size={17} /></span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900">{i.person.name} <span className="text-xs font-normal text-gray-400">{[i.person.employeeId, i.person.position, i.person.department].filter(Boolean).join(" · ")}</span></p>
          <p className="mt-0.5 text-sm text-gray-800">{t(i.title)}</p>
          <p className="text-xs text-gray-500">
            {formatDate(new Date(i.start))}{i.end !== i.start && <> – {formatDate(new Date(i.end))}</>} · {dec(i.days)} <T>hari</T>
            {halfDayLabel(i.halfDay) && <> · {t(halfDayLabel(i.halfDay)!)}</>}
          </p>
          {i.unpaidDays > 0 && <p className="mt-1 text-xs text-amber-700">{dec(i.unpaidDays)} <T>hari melebihi saldo dan masuk cuti di luar tanggungan.</T></p>}
          <p className="mt-1.5 whitespace-pre-line rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">{i.reason}</p>
          {i.status !== "PENDING" && (
            <p className="mt-1.5 text-[11px] text-gray-400">
              {i.decidedBy ?? "—"}{i.decidedAt && <> · {formatDate(new Date(i.decidedAt))}</>}{i.note && <> · <T>Catatan</T>: {i.note}</>}
            </p>
          )}
        </div>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${st.cls}`}><T>{st.label}</T></span>
      </div>
      {i.status === "PENDING" && (
        <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
          <input value={note} onChange={(e) => setNote(e.target.value)}
            placeholder={t(rejecting ? "Alasan penolakan (wajib)" : "Catatan untuk karyawan (opsional)")}
            className="h-9 w-full rounded-lg border border-gray-200 px-3 text-sm" />
          {error && <p className="text-xs text-rose-600"><T>{error}</T></p>}
          <div className="flex justify-end gap-2">
            {rejecting ? (
              <>
                <button type="button" disabled={pending} onClick={() => { setRejecting(false); setError(""); }} className="rounded-full px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100"><T>Batal</T></button>
                <button type="button" disabled={pending} onClick={() => decide(false)}
                  className="inline-flex items-center gap-1 rounded-full bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                  {pending ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />} <T>Tolak pengajuan</T>
                </button>
              </>
            ) : (
              <>
                <button type="button" disabled={pending} onClick={() => setRejecting(true)}
                  className="inline-flex items-center gap-1 rounded-full border border-gray-200 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50"><X size={13} /> <T>Tolak</T></button>
                <button type="button" disabled={pending} onClick={() => decide(true)}
                  className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                  {pending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} <T>Setujui</T>
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
