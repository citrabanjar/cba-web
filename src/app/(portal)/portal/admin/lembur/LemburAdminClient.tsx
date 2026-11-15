"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Clock, FileText, Loader2, Send, X } from "lucide-react";
import { T, useT } from "@/components/i18n";
import { DateInput } from "@/components/ui/date-input";
import { useCanEdit } from "@/components/portal/edit-access";
import { formatDate } from "@/lib/utils";
import { OT_STATUS } from "@/lib/overtime-status";
import { cancelSplItem, createSpl, decideRevision } from "./actions";

export type AdminOvertime = {
  id: string; name: string; employeeId: string | null; date: string; start: string; end: string; breakStart: string | null; breakEnd: string | null;
  planned: number; spl: string | null; status: string; checkOut: string | null; paid: number | null;
  revisionStatus: string | null; revisionEnd: string | null; note: string | null; reason: string | null;
};
export type EmployeePick = { id: string; name: string; employeeId: string | null; department: string | null };

const num = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");
const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const shiftMonth = (m: string, d: number) => { const [y, mm] = m.split("-").map(Number); const x = new Date(Date.UTC(y, mm - 1 + d, 1)); return x.toISOString().slice(0, 7); };
const field = "h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm";

export default function LemburAdminClient({ spl, month, rows, revisions, employees }: {
  spl: boolean; month: string; rows: AdminOvertime[]; revisions: AdminOvertime[]; employees: EmployeePick[];
}) {
  const canEdit = useCanEdit("absensi");
  const [y, m] = month.split("-").map(Number);
  const paidTotal = rows.reduce((a, r) => a + (r.paid ?? 0), 0);
  return (
    <div className="max-w-6xl space-y-5 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-bold text-white"><T>Lembur</T></h1>
        <p className="mt-0.5 text-sm text-white/70">
          <T>{spl ? "Surat Perintah Lembur (SPL) dibuat Admin; karyawan menjawab Bersedia / Tidak bersedia." : "SPL tidak dipakai: karyawan mengajukan lembur sendiri, diputus atasan langsung / Workflow."}</T>
        </p>
      </div>

      {revisions.length > 0 && (
        <section className="space-y-3 rounded-2xl border border-amber-300 bg-amber-50 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-amber-800"><AlertTriangle size={16} /> {revisions.length} <T>revisi jam lembur menunggu keputusan</T></p>
          <p className="text-xs text-amber-700"><T>Karyawan absen pulang melewati jam akhir SPL. Selama belum diputus, lembur dibayar sampai jam akhir SPL dan gaji periode itu belum bisa difinalkan.</T></p>
          {revisions.map((r) => <RevisionCard key={r.id} item={r} canEdit={canEdit} />)}
        </section>
      )}

      {spl && canEdit && <SplForm employees={employees} />}

      <section className="rounded-2xl border border-gray-200 bg-white">
        <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 px-5 py-3">
          <FileText size={16} className="text-brand" />
          <h3 className="flex-1 text-sm font-semibold text-gray-800"><T>Rekap Lembur</T></h3>
          <span className="text-xs text-gray-500"><T>Dibayar</T>: <b>{num(paidTotal)}</b> <T>jam</T></span>
          <div className="flex items-center gap-1">
            <Link scroll={false} href={`?bulan=${shiftMonth(month, -1)}`} className="rounded-full p-1.5 text-gray-500 hover:bg-gray-100"><ChevronLeft size={16} /></Link>
            <span className="w-32 text-center text-sm font-semibold text-gray-800">{MONTHS[m - 1]} {y}</span>
            <Link scroll={false} href={`?bulan=${shiftMonth(month, 1)}`} className="rounded-full p-1.5 text-gray-500 hover:bg-gray-100"><ChevronRight size={16} /></Link>
          </div>
        </div>
        {rows.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-gray-400"><T>Belum ada lembur di bulan ini.</T></p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-400">
                <tr>
                  <th className="px-4 py-2"><T>Karyawan</T></th><th className="px-3 py-2"><T>Tanggal</T></th><th className="px-3 py-2"><T>Jam lembur</T></th>
                  <th className="px-3 py-2"><T>Sumber</T></th><th className="px-3 py-2"><T>Status</T></th><th className="px-3 py-2 text-right"><T>Pulang</T></th>
                  <th className="px-3 py-2 text-right"><T>Dibayar</T></th><th />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map((r) => <Row key={r.id} r={r} canEdit={canEdit} />)}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Row({ r, canEdit }: { r: AdminOvertime; canEdit: boolean }) {
  const [pending, start] = useTransition();
  const st = OT_STATUS[r.status] ?? { label: r.status, cls: "bg-gray-100 text-gray-600" };
  return (
    <tr className="align-top">
      <td className="px-4 py-2.5"><p className="font-medium text-gray-900">{r.name}</p><p className="text-[11px] text-gray-400">{r.employeeId}</p></td>
      <td className="px-3 py-2.5 whitespace-nowrap">{formatDate(new Date(r.date))}</td>
      <td className="px-3 py-2.5 whitespace-nowrap">{r.start}–{r.end}<p className="text-[11px] text-gray-400">{r.breakStart ? <><T>istirahat</T> {r.breakStart}–{r.breakEnd} · </> : null}{num(r.planned)} <T>jam</T></p></td>
      <td className="px-3 py-2.5 text-xs text-gray-500">{r.spl ?? <T>Pengajuan</T>}</td>
      <td className="px-3 py-2.5">
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${st.cls}`}><T>{st.label}</T></span>
        {r.revisionStatus && <p className="mt-1 text-[11px] text-amber-700"><T>Revisi</T> {r.revisionEnd}: <T>{r.revisionStatus === "MENUNGGU" ? "menunggu" : r.revisionStatus === "DISETUJUI" ? "disetujui" : "ditolak"}</T></p>}
        {r.status === "TIDAK_BERSEDIA" && r.note && <p className="mt-1 max-w-48 text-[11px] text-gray-400">{r.note}</p>}
      </td>
      <td className="px-3 py-2.5 text-right text-xs text-gray-500">{r.checkOut ?? "—"}</td>
      <td className="px-3 py-2.5 text-right font-semibold text-gray-900">{r.paid === null ? "—" : `${num(r.paid)} jam`}</td>
      <td className="px-3 py-2.5 text-right">
        {canEdit && r.spl && ["MENUNGGU_KARYAWAN", "DISETUJUI"].includes(r.status) && !r.checkOut && (
          <button type="button" disabled={pending} onClick={() => { if (window.confirm("Batalkan lembur karyawan ini?")) start(async () => { const x = await cancelSplItem(r.id); if (x.error) window.alert(x.error); }); }}
            className="text-xs text-rose-600 hover:underline disabled:opacity-50"><T>Batalkan</T></button>
        )}
      </td>
    </tr>
  );
}

function RevisionCard({ item: r, canEdit }: { item: AdminOvertime; canEdit: boolean }) {
  const t = useT();
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const decide = (approve: boolean) => start(async () => {
    setError("");
    const x = await decideRevision(r.id, approve, note);
    if (x.error) setError(x.error);
  });
  return (
    <div className="rounded-xl border border-amber-200 bg-white p-3">
      <p className="text-sm font-semibold text-gray-900">{r.name} <span className="text-xs font-normal text-gray-400">{r.employeeId} · {r.spl}</span></p>
      <p className="text-sm text-gray-700">{formatDate(new Date(r.date))} · SPL <b>{r.start}–{r.end}</b> · <T>absen pulang</T> <b className="text-amber-700">{r.checkOut ?? r.revisionEnd}</b></p>
      <p className="text-xs text-gray-500"><T>Minta lembur dihitung sampai</T> {r.revisionEnd}</p>
      {canEdit && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("Catatan (wajib bila ditolak)")} className="h-9 min-w-48 flex-1 rounded-lg border border-gray-200 px-3 text-sm" />
          <button type="button" disabled={pending} onClick={() => decide(false)} className="inline-flex items-center gap-1 rounded-full border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 disabled:opacity-50"><X size={13} /> <T>Tolak</T></button>
          <button type="button" disabled={pending} onClick={() => decide(true)} className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
            {pending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} <T>Setujui revisi</T>
          </button>
        </div>
      )}
      {error && <p className="mt-1 text-xs text-rose-600"><T>{error}</T></p>}
    </div>
  );
}

function SplForm({ employees }: { employees: EmployeePick[] }) {
  const t = useT();
  const [f, setF] = useState({ date: "", startTime: "16:00", endTime: "20:00", note: "" });
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [dept, setDept] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const depts = useMemo(() => [...new Set(employees.map((e) => e.department).filter(Boolean))].sort() as string[], [employees]);
  const shown = employees.filter((e) => (!dept || e.department === dept) && (!q || `${e.name} ${e.employeeId ?? ""}`.toLowerCase().includes(q.toLowerCase())));
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const submit = () => start(async () => {
    setMsg(null);
    const r = await createSpl({ ...f, userIds: [...picked] });
    if (r.error) setMsg({ ok: false, text: r.error });
    else {
      setMsg({ ok: true, text: `${r.number} terkirim ke ${picked.size - (r.skipped?.length ?? 0)} karyawan.${r.skipped?.length ? ` Dilewati (sudah ada lembur): ${r.skipped.join(", ")}.` : ""}` });
      setPicked(new Set());
    }
  });
  return (
    <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5">
      <p className="flex items-center gap-2 text-sm font-semibold text-gray-800"><Clock size={16} className="text-brand" /> <T>Buat Surat Perintah Lembur</T></p>
      <div className="grid gap-3 sm:grid-cols-5">
        <div className="sm:col-span-1"><label className="mb-1 block text-xs font-medium text-gray-500"><T>Tanggal</T></label><DateInput value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-500"><T>Lembur dari jam</T></label><input type="time" value={f.startTime} onChange={(e) => setF({ ...f, startTime: e.target.value })} className={field} /></div>
        <div><label className="mb-1 block text-xs font-medium text-gray-500"><T>Sampai jam</T></label><input type="time" value={f.endTime} onChange={(e) => setF({ ...f, endTime: e.target.value })} className={field} /></div>
      </div>
      <p className="-mt-2 text-[11px] text-gray-400"><T>Di hari kerja jam lembur harus di luar jam shift karyawan (sebelum jam masuk atau mulai jam pulang). Istirahat 12:00–13:00 dan 18:00–19:00 dipotong otomatis bila dilewati.</T></p>
      <div><label className="mb-1 block text-xs font-medium text-gray-500"><T>Pekerjaan / keterangan</T></label>
        <textarea rows={2} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder={t("Mis. menyelesaikan fabrikasi proyek X")} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" />
      </div>

      <div className="rounded-xl border border-gray-200">
        <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 p-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Cari nama atau ID...")} className="h-9 min-w-40 flex-1 rounded-lg border border-gray-200 px-3 text-sm" />
          <select value={dept} onChange={(e) => setDept(e.target.value)} className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-sm">
            <option value="">{t("Semua departemen")}</option>
            {depts.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <button type="button" onClick={() => setPicked((s) => new Set([...s, ...shown.map((e) => e.id)]))} className="text-xs font-medium text-brand hover:underline"><T>Pilih semua yang tampil</T></button>
          <span className="ml-auto text-xs text-gray-500">{picked.size} <T>dipilih</T></span>
        </div>
        <div className="max-h-64 overflow-y-auto">
          {shown.map((e) => (
            <label key={e.id} className="flex cursor-pointer items-center gap-3 border-b border-gray-50 px-3 py-2 text-sm last:border-b-0 hover:bg-gray-50">
              <input type="checkbox" checked={picked.has(e.id)} onChange={() => toggle(e.id)} className="h-4 w-4 accent-[var(--color-brand)]" />
              <span className="flex-1">{e.name} <span className="text-xs text-gray-400">{e.employeeId}{e.department ? ` · ${e.department}` : ""}</span></span>
            </label>
          ))}
        </div>
      </div>

      {msg && <p className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}><T>{msg.text}</T></p>}
      <div className="flex justify-end">
        <button type="button" disabled={pending || picked.size === 0} onClick={submit} className="inline-flex items-center gap-1.5 rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white disabled:opacity-40">
          {pending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} <T>Kirim SPL</T>
        </button>
      </div>
    </section>
  );
}
