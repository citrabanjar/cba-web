"use client";

import { Input } from "@/components/ui/input";

import { useEffect, useState, useTransition } from "react";
import { ArrowLeftRight, Check, Loader2, X } from "lucide-react";
import { T, useT } from "@/components/i18n";
import { formatDate } from "@/lib/utils";
import { SWAP_STATUS } from "@/lib/shift-swap-status";
import { cancelSwap, previewSwap, respondSwap, submitSwap } from "./actions";

type Person = { id: string; name: string; employeeId: string | null; department: string | null };
export type SwapView = {
  id: string; date: string; status: string; mine: boolean; requester: Person; partner: Person;
  requesterShift: string; partnerShift: string; reason: string | null; note: string | null;
  partnerAt: string | null; managerA: string | null; managerB?: string | null; createdAt: string;
};

const field = "h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm";

export default function TukarShiftClient({ items, colleagues }: { items: SwapView[]; colleagues: Person[] }) {
  const incoming = items.filter((i) => !i.mine && i.status === "MENUNGGU_REKAN");
  const others = items.filter((i) => !(!i.mine && i.status === "MENUNGGU_REKAN"));
  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6">
      {incoming.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/70"><T>Permintaan dari rekan</T></p>
          {incoming.map((i) => <SwapCard key={i.id} s={i} incoming />)}
        </div>
      )}
      <SwapForm colleagues={colleagues} />
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-white/70"><T>Riwayat Tukar Shift</T></p>
        {others.length === 0
          ? <p className="rounded-2xl border border-dashed border-gray-300 bg-white/70 p-6 text-center text-sm text-gray-400"><T>Belum ada.</T></p>
          : others.map((i) => <SwapCard key={i.id} s={i} />)}
      </div>
    </div>
  );
}

function SwapForm({ colleagues }: { colleagues: Person[] }) {
  const t = useT();
  const [date, setDate] = useState("");
  const [partnerId, setPartnerId] = useState("");
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof previewSwap>> | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  useEffect(() => {
    let live = true;
    if (date && partnerId) previewSwap(date, partnerId).then((p) => { if (live) setPreview(p); });
    return () => { live = false; };
  }, [date, partnerId]);
  const shown = date && partnerId ? preview : null;
  const submit = () => start(async () => {
    setMsg(null);
    const r = await submitSwap({ date, partnerId, reason });
    if (r.error) setMsg({ ok: false, text: r.error });
    else { setMsg({ ok: true, text: "Pengajuan dikirim ke rekan untuk disetujui." }); setPartnerId(""); setReason(""); setPreview(null); }
  });
  return (
    <div className="space-y-3 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <h3 className="flex items-center gap-2 font-semibold text-gray-700"><ArrowLeftRight size={16} className="text-brand" /> <T>Ajukan Tukar Shift</T></h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-xs font-medium text-gray-500"><span><T>Tanggal</T></span>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} /></label>
        <label className="space-y-1 text-xs font-medium text-gray-500"><span><T>Tukar dengan</T></span>
          <select value={partnerId} onChange={(e) => setPartnerId(e.target.value)} className={field}>
            <option value="">{t("-- Pilih rekan --")}</option>
            {colleagues.map((c) => <option key={c.id} value={c.id}>{c.name}{c.employeeId ? ` (${c.employeeId})` : ""}{c.department ? ` · ${c.department}` : ""}</option>)}
          </select></label>
      </div>
      {shown && (
        shown.error
          ? <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">{shown.error}</p>
          : shown.mine && shown.theirs && (
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-xl bg-gray-50 px-3 py-2 text-xs text-gray-700">
              <span><T>Shift Anda</T>: <b>{shown.mine.code}</b> <span className="text-gray-400">{shown.mine.name}</span></span>
              <ArrowLeftRight size={14} className="text-gray-400" />
              <span><T>Shift rekan</T>: <b>{shown.theirs.code}</b> <span className="text-gray-400">{shown.theirs.name}</span></span>
            </div>
          )
      )}
      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("Alasan (opsional)")} className={field} />
      {msg && <p className={`rounded-xl px-3 py-2 text-xs ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}><T>{msg.text}</T></p>}
      <button type="button" disabled={pending || !date || !partnerId || !!shown?.error} onClick={submit}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-ink py-3 font-semibold text-white hover:bg-brand disabled:opacity-50">
        {pending ? <Loader2 size={16} className="animate-spin" /> : <ArrowLeftRight size={16} />} <T>Kirim ke Rekan</T>
      </button>
      <p className="text-[11px] text-gray-400"><T>Bisa diajukan selama Anda dan rekan belum check-in/check-out di tanggal itu.</T></p>
    </div>
  );
}

function SwapCard({ s, incoming }: { s: SwapView; incoming?: boolean }) {
  const t = useT();
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const st = SWAP_STATUS[s.status] ?? { label: s.status, cls: "bg-gray-100 text-gray-600" };
  const other = s.mine ? s.partner : s.requester;
  const myShift = s.mine ? s.requesterShift : s.partnerShift;
  const theirShift = s.mine ? s.partnerShift : s.requesterShift;
  const run = (fn: () => Promise<{ error?: string }>) => start(async () => { setError(""); const r = await fn(); if (r.error) setError(r.error); });
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900">{formatDate(new Date(s.date))} · <T>{s.mine ? "dengan" : "dari"}</T> {other.name}</p>
          <p className="text-xs text-gray-500"><T>Shift Anda</T> <b>{myShift}</b> → <b>{theirShift}</b></p>
          {s.reason && <p className="mt-1 text-xs text-gray-500"><T>Alasan</T>: {s.reason}</p>}
          {s.status === "MENUNGGU_ATASAN" && (
            <p className="mt-1 text-[11px] text-gray-400">
              <T>Atasan pemohon</T>: {s.managerA ?? t("menunggu")}{s.managerB !== undefined && <> · <T>Atasan rekan</T>: {s.managerB ?? t("menunggu")}</>}
            </p>
          )}
          {s.note && <p className="mt-1 text-xs text-gray-500"><T>Catatan</T>: {s.note}</p>}
        </div>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${st.cls}`}><T>{st.label}</T></span>
      </div>
      {incoming && (
        <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("Catatan (opsional)")} className="h-9 w-full rounded-lg border border-gray-200 px-3 text-sm" />
          <div className="flex justify-end gap-2">
            <button type="button" disabled={pending} onClick={() => run(() => respondSwap(s.id, false, note))}
              className="inline-flex items-center gap-1 rounded-full border border-gray-200 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50"><X size={13} /> <T>Tolak</T></button>
            <button type="button" disabled={pending} onClick={() => run(() => respondSwap(s.id, true, note))}
              className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
              {pending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} <T>Terima</T>
            </button>
          </div>
        </div>
      )}
      {s.mine && ["MENUNGGU_REKAN", "MENUNGGU_ATASAN"].includes(s.status) && (
        <div className="mt-2 flex justify-end">
          <button type="button" disabled={pending} onClick={() => run(() => cancelSwap(s.id))} className="text-xs font-medium text-gray-500 hover:text-rose-600"><T>Batalkan pengajuan</T></button>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-rose-600"><T>{error}</T></p>}
    </div>
  );
}
