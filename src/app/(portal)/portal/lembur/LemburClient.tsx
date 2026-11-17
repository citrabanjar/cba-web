"use client";

import { showNotice } from "@/components/portal/Confirm";
import { useState, useTransition } from "react";
import { Check, Clock, Loader2, Plus, X } from "lucide-react";
import { T, useT } from "@/components/i18n";
import { DateInput } from "@/components/ui/date-input";
import { formatDate } from "@/lib/utils";
import { OT_STATUS } from "@/lib/overtime-status";
import { cancelOvertime, respondSpl, submitOvertime } from "./actions";

export type MyOvertime = {
  id: string; date: string; start: string; end: string; breakStart: string | null; breakEnd: string | null;
  planned: number; paid: number | null; status: string; spl: string | null; reason: string | null; note: string | null; decidedBy: string | null;
  revisionStatus: string | null; revisionEnd: string | null;
};

const num = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");
const field = "h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm";

export default function LemburClient({ spl, items }: { spl: boolean; items: MyOvertime[] }) {
  const waiting = items.filter((i) => i.status === "MENUNGGU_KARYAWAN");
  const others = items.filter((i) => i.status !== "MENUNGGU_KARYAWAN");
  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-4 text-xs text-gray-500">
        <p className="flex items-start gap-2"><Clock size={14} className="mt-0.5 shrink-0 text-brand" />
          <span><T>Lembur dibayar per 1 jam penuh (kurang dari 1 jam tidak dibayar), dihitung sampai jam absen pulang, di luar istirahat 12:00–13:00 dan 18:00–19:00.</T></span>
        </p>
      </div>

      {/* SPL yang sudah dikirim selalu bisa dijawab, walau saklar SPL kemudian dimatikan. */}
      {waiting.length > 0 && (
        <section className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/70"><T>Surat Perintah Lembur menunggu jawaban Anda</T></p>
          {waiting.map((i) => <SplCard key={i.id} item={i} />)}
        </section>
      )}
      {!spl && <RequestForm />}

      <section className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-white/70"><T>Riwayat Lembur</T></p>
        {others.length === 0 ? (
          <p className="rounded-2xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-400"><T>Belum ada lembur.</T></p>
        ) : others.map((i) => <HistoryCard key={i.id} item={i} />)}
      </section>
    </div>
  );
}

function When({ i }: { i: MyOvertime }) {
  return (
    <p className="text-sm text-gray-800">
      {formatDate(new Date(i.date))} · <b>{i.start}–{i.end}</b>
      {i.breakStart && <span className="text-gray-500"> · <T>istirahat</T> {i.breakStart}–{i.breakEnd}</span>}
      <span className="text-gray-500"> · {num(i.planned)} <T>jam</T></span>
    </p>
  );
}

function SplCard({ item: i }: { item: MyOvertime }) {
  const t = useT();
  const [pending, start] = useTransition();
  const [refusing, setRefusing] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const answer = (accept: boolean) => start(async () => {
    setError("");
    const r = await respondSpl(i.id, accept, note);
    if (r.error) setError(r.error);
  });
  return (
    <div className="rounded-2xl border border-amber-200 bg-white p-4">
      <p className="text-xs font-semibold text-amber-700">{i.spl}</p>
      <When i={i} />
      {i.reason && <p className="mt-1.5 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">{i.reason}</p>}
      {refusing && (
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("Alasan tidak bersedia (wajib)")}
          className="mt-3 h-9 w-full rounded-lg border border-gray-200 px-3 text-sm" />
      )}
      {error && <p className="mt-2 text-xs text-rose-600"><T>{error}</T></p>}
      <div className="mt-3 flex justify-end gap-2">
        {refusing ? (
          <>
            <button type="button" disabled={pending} onClick={() => setRefusing(false)} className="rounded-full px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100"><T>Batal</T></button>
            <button type="button" disabled={pending} onClick={() => answer(false)} className="inline-flex items-center gap-1 rounded-full bg-gray-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
              {pending ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />} <T>Kirim: Tidak bersedia</T>
            </button>
          </>
        ) : (
          <>
            <button type="button" disabled={pending} onClick={() => setRefusing(true)} className="rounded-full border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50"><T>Tidak bersedia</T></button>
            <button type="button" disabled={pending} onClick={() => answer(true)} className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
              {pending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} <T>Bersedia</T>
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function HistoryCard({ item: i }: { item: MyOvertime }) {
  const [pending, start] = useTransition();
  const st = OT_STATUS[i.status] ?? { label: i.status, cls: "bg-gray-100 text-gray-600" };
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          {i.spl && <p className="text-xs font-semibold text-gray-400">{i.spl}</p>}
          <When i={i} />
          {i.paid !== null && <p className="mt-0.5 text-xs font-semibold text-emerald-700"><T>Dibayar</T>: {num(i.paid)} <T>jam</T></p>}
          {i.revisionStatus && (
            <p className="mt-0.5 text-xs text-amber-700">
              <T>Pulang melewati jam SPL</T> ({i.revisionEnd}) · <T>{i.revisionStatus === "MENUNGGU" ? "revisi menunggu persetujuan Admin" : i.revisionStatus === "DISETUJUI" ? "revisi disetujui" : "revisi ditolak"}</T>
            </p>
          )}
          {i.reason && !i.spl && <p className="mt-1 text-xs text-gray-500">{i.reason}</p>}
          {i.note && <p className="mt-1 text-[11px] text-gray-400"><T>Catatan</T>: {i.note}{i.decidedBy && ` · ${i.decidedBy}`}</p>}
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${st.cls}`}><T>{st.label}</T></span>
          {i.status === "PENDING" && (
            <button type="button" disabled={pending} onClick={() => start(async () => { await cancelOvertime(i.id); })}
              className="text-xs text-rose-600 hover:underline disabled:opacity-50"><T>Batalkan</T></button>
          )}
        </div>
      </div>
    </div>
  );
}

function RequestForm() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ date: "", startTime: "16:00", endTime: "18:00", reason: "" });
  const [pending, start] = useTransition();
  // Hasil kirim: dialog standar portal (Pemberitahuan / Gagal).
  const submit = () => start(async () => {
    const r = await submitOvertime(f);
    if (r.error) void showNotice(t(r.error), "error");
    else { void showNotice(`${t("Pengajuan lembur diajukan ke")} ${r.approver ?? ""} ${t("untuk approval.")}`); setF({ ...f, date: "", reason: "" }); setOpen(false); }
  });
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand py-3 text-sm font-semibold text-white hover:bg-brand-dark">
        <Plus size={16} /> <T>Ajukan Lembur</T>
      </button>
    );
  }
  return (
    <div className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4">
      <p className="font-semibold text-gray-900"><T>Pengajuan Lembur</T></p>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-500"><T>Tanggal</T></label>
        <DateInput value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="mb-1 block text-xs font-medium text-gray-500"><T>Lembur dari jam</T></label><input type="time" value={f.startTime} onChange={(e) => setF({ ...f, startTime: e.target.value })} className={field} /></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-500"><T>Sampai jam</T></label><input type="time" value={f.endTime} onChange={(e) => setF({ ...f, endTime: e.target.value })} className={field} /></div>
      </div>
      <p className="-mt-1 text-[11px] text-gray-400"><T>Di hari kerja lembur di luar jam shift: sebelum masuk paling lambat sampai jam masuk, sesudah pulang mulai jam pulang. Istirahat 12:00–13:00 dan 18:00–19:00 dipotong otomatis bila dilewati.</T></p>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-500"><T>Keperluan</T></label>
        <textarea rows={3} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder={t("Pekerjaan yang dikerjakan saat lembur...")} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" />
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="rounded-full px-4 py-2 text-sm text-gray-500 hover:bg-gray-100"><T>Tutup</T></button>
        <button type="button" disabled={pending} onClick={submit} className="inline-flex items-center gap-1.5 rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {pending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} <T>Kirim Pengajuan</T>
        </button>
      </div>
    </div>
  );
}
