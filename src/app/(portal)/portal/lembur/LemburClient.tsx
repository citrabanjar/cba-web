"use client";

import { showNotice } from "@/components/portal/Confirm";
import { useState, useTransition } from "react";
import { Check, Clock, Loader2, Plus, User, Users, X } from "lucide-react";
import { T, useT } from "@/components/i18n";
import { DateInput } from "@/components/ui/date-input";
import { formatDate } from "@/lib/utils";
import { OT_STATUS } from "@/lib/overtime-status";
import { cancelOvertime, cancelTeamOvertime, respondSpl, submitOvertime } from "./actions";
import type { TeamOvertime } from "@/lib/spl";

export type MyOvertime = {
  id: string; date: string; start: string; end: string; breakStart: string | null; breakEnd: string | null;
  planned: number; paid: number | null; status: string; spl: string | null; reason: string | null; note: string | null; decidedBy: string | null;
  revisionStatus: string | null; revisionEnd: string | null;
};

const num = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");
const field = "h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm";

export default function LemburClient({ spl, items, team = null, initialTeam = false }: { spl: boolean; items: MyOvertime[]; team?: TeamOvertime[] | null; initialTeam?: boolean }) {
  const [tab, setTab] = useState<"saya" | "tim">(initialTeam ? "tim" : "saya");
  const waiting = items.filter((i) => i.status === "MENUNGGU_KARYAWAN");
  const others = items.filter((i) => i.status !== "MENUNGGU_KARYAWAN");
  const teamWaiting = team?.filter((x) => x.status === "MENUNGGU_KARYAWAN").length ?? 0;
  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
      {/* Atasan: tab Lembur Tim berisi SPL karyawan di bawahnya. */}
      {team && (
        <div className="flex gap-1 rounded-2xl border border-gray-200 bg-white p-1.5">
          {([["saya", "Lembur Saya", User], ["tim", "Lembur Tim", Users]] as const).map(([k, label, Icon]) => (
            <button key={k} type="button" onClick={() => setTab(k)}
              className={`inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-full px-4 text-sm ${tab === k ? "bg-ink font-semibold text-white" : "text-gray-500 hover:bg-gray-100"}`}>
              <Icon size={15} /> <T>{label}</T>
              {k === "tim" && teamWaiting > 0 && <span className="text-xs opacity-70">{teamWaiting}</span>}
            </button>
          ))}
        </div>
      )}
      {tab === "tim" && team ? <TeamList rows={team} /> : <>
      <div className="rounded-2xl border border-gray-200 bg-white p-4 text-xs text-gray-500">
        <p className="flex items-start gap-2"><Clock size={14} className="mt-0.5 shrink-0 text-brand" />
          <span><T>Lembur dibayar per 1 jam penuh (kurang dari 1 jam tidak dibayar), dihitung sampai jam absen pulang. Istirahat dipotong bila tercakup penuh: hari kerja 18:00–19:00; hari libur 12:00–13:00 dan 18:00–19:00.</T></span>
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
      </>}
    </div>
  );
}

const rupiah = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;

// Lembur Tim: atasan langsung melihat info; atasan di atasnya sampai pimpinan puncak melihat estimasi dan bisa membatalkan.
function TeamList({ rows }: { rows: TeamOvertime[] }) {
  const active = rows.filter((r) => ["MENUNGGU_KARYAWAN", "DISETUJUI"].includes(r.status));
  const est = active.reduce((a, r) => a + (r.estimate ?? 0), 0);
  return (
    <section className="space-y-3">
      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <p className="text-sm font-semibold text-gray-900"><T>Surat Perintah Lembur tim Anda</T></p>
        <p className="mt-0.5 text-xs text-gray-500">
          {active.length} <T>lembur berjalan</T>{est > 0 && <> · <T>estimasi upah lembur</T> <b className="text-gray-800">{rupiah(est)}</b></>}
        </p>
        <p className="mt-1 text-[11px] text-gray-400"><T>Karyawan langsung Anda tampil sebagai info. Lembur karyawan di bawah atasan langsungnya bisa Anda batalkan selama belum absen pulang.</T></p>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-2xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-400"><T>Belum ada SPL untuk tim Anda.</T></p>
      ) : rows.map((r) => <TeamCard key={r.id} r={r} />)}
    </section>
  );
}

function TeamCard({ r }: { r: TeamOvertime }) {
  const t = useT();
  const [pending, start] = useTransition();
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const st = OT_STATUS[r.status] ?? { label: r.status, cls: "bg-gray-100 text-gray-600" };
  const cancel = () => start(async () => {
    const x = await cancelTeamOvertime(r.id, reason);
    if (x.error) void showNotice(t(x.error), "error");
    else { setCancelling(false); void showNotice(t("Lembur dibatalkan. Karyawan, Admin pembuat SPL, dan atasannya sudah diberi tahu.")); }
  });
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900">{r.name} <span className="text-xs font-normal text-gray-400">{r.employeeId}</span>
            {r.direct && <span className="ml-1.5 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600"><T>Bawahan langsung</T></span>}</p>
          <p className="text-xs text-gray-400">{r.spl}</p>
          <p className="text-sm text-gray-800">{formatDate(new Date(r.date))} · <b>{r.start}–{r.end}</b> <span className="text-gray-500">· {num(r.hours)} <T>jam</T> · <T>{r.rest ? "Hari libur" : "Hari kerja"}</T></span></p>
          {r.reason && <p className="mt-1 rounded-lg bg-gray-50 px-3 py-1.5 text-xs text-gray-600">{r.reason}</p>}
          {r.estimate != null && <p className="mt-1 text-xs text-gray-600"><T>Estimasi upah lembur</T>: <b className="text-gray-900">{rupiah(r.estimate)}</b></p>}
          {r.note && ["DIBATALKAN", "TIDAK_BERSEDIA"].includes(r.status) && <p className="mt-1 text-[11px] text-gray-400"><T>Alasan</T>: {r.note}{r.decidedBy && ` · ${r.decidedBy}`}</p>}
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${st.cls}`}><T>{st.label}</T></span>
          {r.canCancel && !cancelling && <button type="button" onClick={() => setCancelling(true)} className="text-xs text-rose-600 hover:underline"><T>Batalkan</T></button>}
        </div>
      </div>
      {cancelling && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("Alasan pembatalan (wajib)")} className="h-9 min-w-48 flex-1 rounded-lg border border-gray-200 px-3 text-sm" />
          <button type="button" onClick={() => setCancelling(false)} className="rounded-full px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100"><T>Tutup</T></button>
          <button type="button" disabled={pending || !reason.trim()} onClick={cancel} className="inline-flex items-center gap-1 rounded-full bg-red-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">
            {pending ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />} <T>Batalkan lembur</T>
          </button>
        </div>
      )}
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
      <p className="-mt-1 text-[11px] text-gray-400"><T>Di hari kerja lembur di luar jam shift: sebelum masuk paling lambat sampai jam masuk, sesudah pulang mulai jam pulang. Istirahat dipotong bila tercakup penuh: hari kerja 18:00–19:00; hari libur 12:00–13:00 dan 18:00–19:00.</T></p>
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
