"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle, CalendarClock, Check, ChevronLeft, ChevronRight, ClipboardList, Clock, FileText, Loader2, Plus, Send, Settings2, Timer, Trash2, Users, Wallet, X,
} from "lucide-react";
import { T, useT } from "@/components/i18n";
import { DateInput } from "@/components/ui/date-input";
import EmployeeCombobox from "@/components/portal/EmployeeCombobox";
import { showNotice } from "@/components/portal/Confirm";
import { formatDate } from "@/lib/utils";
import { OT_STATUS } from "@/lib/overtime-status";
import { OT_BREAK_RULE, otPlan } from "@/lib/overtime-calc";
import type { SplRowCheck, SplRules } from "@/lib/spl";
import { cancelSplItem, createSpl, decideRevision, previewSpl, saveSplRules } from "./actions";

export type AdminOvertime = {
  id: string; name: string; employeeId: string | null; date: string; start: string; end: string; breakStart: string | null; breakEnd: string | null;
  planned: number; rest?: boolean; spl: string | null; status: string; checkOut: string | null; paid: number | null;
  revisionStatus: string | null; revisionEnd: string | null; note: string | null; reason: string | null;
};
export type EmployeePick = { id: string; name: string; employeeId: string | null; department: string | null };

const num = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");
const rupiah = (n: number) => `Rp${Math.round(n).toLocaleString("id-ID")}`;
const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const shiftMonth = (m: string, d: number) => { const [y, mm] = m.split("-").map(Number); const x = new Date(Date.UTC(y, mm - 1 + d, 1)); return x.toISOString().slice(0, 7); };
const field = "h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand/40";

type Tab = "buat" | "rekap" | "aturan";

export default function LemburAdminClient({ canSpl, canRevise, spl, month, rules, rows, revisions, employees }: {
  canSpl: boolean; canRevise: boolean; spl: boolean; month: string; rules: SplRules; rows: AdminOvertime[]; revisions: AdminOvertime[]; employees: EmployeePick[];
}) {
  const [tab, setTab] = useState<Tab>(spl && canSpl ? "buat" : "rekap");
  const [y, m] = month.split("-").map(Number);
  const live = rows.filter((r) => !["DIBATALKAN", "TIDAK_BERSEDIA", "REJECTED", "CANCELLED"].includes(r.status));
  const stats = [
    { label: "SPL bulan ini", value: new Set(rows.map((r) => r.spl).filter(Boolean)).size, icon: FileText, tone: "from-brand to-rose-400" },
    { label: "Karyawan lembur", value: new Set(live.map((r) => r.employeeId ?? r.name)).size, icon: Users, tone: "from-ink to-slate-500" },
    { label: "Jam dibayar", value: num(rows.reduce((a, r) => a + (r.paid ?? 0), 0)), icon: Timer, tone: "from-emerald-500 to-teal-400" },
    { label: "Menunggu jawaban", value: rows.filter((r) => r.status === "MENUNGGU_KARYAWAN").length, icon: Clock, tone: "from-amber-500 to-orange-400" },
  ];
  const tabs = ([
    spl && canSpl && ["buat", "Buat SPL", Plus],
    ["rekap", "Rekap Lembur", ClipboardList],
    spl && canSpl && ["aturan", "Pengaturan SPL", Settings2],
  ].filter(Boolean) as [Tab, string, typeof Plus][]);

  return (
    <div className="min-h-full bg-gray-50">
      <div className="border-b border-gray-100 bg-white px-6 py-4">
        <h2 className="font-bold text-gray-800"><T>Lembur</T></h2>
        <p className="mt-0.5 text-xs text-gray-400">
          <T>{spl ? "Surat Perintah Lembur (SPL) dibuat Admin Lembur; karyawan menjawab Bersedia / Tidak bersedia dan tidak mengajukan lembur sendiri." : "SPL tidak dipakai: karyawan mengajukan lembur sendiri, diputus atasan langsung / Workflow."}</T>
        </p>
      </div>

      <main className="max-w-6xl space-y-5 px-4 py-5 sm:px-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="rounded-2xl border border-gray-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-gray-500"><T>{s.label}</T></p>
                <span className={`flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br text-white ${s.tone}`}><s.icon size={15} /></span>
              </div>
              <p className="mt-2 text-2xl font-bold tracking-tight text-gray-900">{s.value}</p>
              <p className="text-[11px] text-gray-400">{MONTHS[m - 1]} {y}</p>
            </div>
          ))}
        </div>

        {revisions.length > 0 && (
          <section className="space-y-3 rounded-2xl border border-amber-300 bg-amber-50 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-amber-800"><AlertTriangle size={16} /> {revisions.length} <T>revisi jam lembur menunggu keputusan</T></p>
            <p className="text-xs text-amber-700"><T>Karyawan absen pulang melewati jam akhir SPL. Selama belum diputus, lembur dibayar sampai jam akhir SPL dan gaji periode itu belum bisa difinalkan.</T> {!canRevise && <T>Keputusan revisi ada di Admin Payroll.</T>}</p>
            {revisions.map((r) => <RevisionCard key={r.id} item={r} canEdit={canRevise} />)}
          </section>
        )}

        {tabs.length > 1 && (
          <div className="flex flex-wrap gap-1 rounded-2xl border border-gray-200 bg-white p-2">
            {tabs.map(([k, label, Icon]) => (
              <button key={k} type="button" onClick={() => setTab(k)}
                className={`inline-flex h-9 items-center gap-2 rounded-full px-4 text-sm ${tab === k ? "bg-ink font-semibold text-white shadow-sm" : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"}`}>
                <Icon size={15} /> <T>{label}</T>
              </button>
            ))}
          </div>
        )}

        {tab === "buat" && spl && canSpl && <SplForm employees={employees} rules={rules} onDone={() => setTab("rekap")} />}
        {tab === "aturan" && spl && canSpl && <RulesForm rules={rules} />}
        {tab === "rekap" && <Recap month={month} rows={rows} canEdit={canSpl} />}
      </main>
    </div>
  );
}

// ─── Rekap ─────────────────────────────────────────────────────────────────
function Recap({ month, rows, canEdit }: { month: string; rows: AdminOvertime[]; canEdit: boolean }) {
  const [y, m] = month.split("-").map(Number);
  const paidTotal = rows.reduce((a, r) => a + (r.paid ?? 0), 0);
  return (
    <section className="rounded-2xl border border-gray-200 bg-white">
      <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 px-5 py-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-rose-400 text-white"><ClipboardList size={17} /></span>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-gray-900"><T>Rekap Lembur</T></h3>
          <p className="text-xs text-gray-400"><T>Dibayar</T>: <b>{num(paidTotal)}</b> <T>jam</T> · <T>per 1 jam penuh sampai absen pulang</T></p>
        </div>
        <div className="flex items-center gap-1">
          <Link scroll={false} href={`?bulan=${shiftMonth(month, -1)}`} className="rounded-full p-1.5 text-gray-500 hover:bg-gray-100"><ChevronLeft size={16} /></Link>
          <span className="w-32 text-center text-sm font-semibold text-gray-800">{MONTHS[m - 1]} {y}</span>
          <Link scroll={false} href={`?bulan=${shiftMonth(month, 1)}`} className="rounded-full p-1.5 text-gray-500 hover:bg-gray-100"><ChevronRight size={16} /></Link>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-gray-400"><T>Belum ada lembur di bulan ini.</T></p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {rows.map((r) => <RecapRow key={r.id} r={r} canEdit={canEdit} />)}
        </ul>
      )}
    </section>
  );
}

function RecapRow({ r, canEdit }: { r: AdminOvertime; canEdit: boolean }) {
  const t = useT();
  const [pending, start] = useTransition();
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const st = OT_STATUS[r.status] ?? { label: r.status, cls: "bg-gray-100 text-gray-600" };
  const cancel = () => start(async () => {
    const x = await cancelSplItem(r.id, reason);
    if (x.error) void showNotice(t(x.error), "error");
    else { setCancelling(false); void showNotice(t("Lembur dibatalkan. Karyawan dan atasannya sudah diberi tahu.")); }
  });
  return (
    <li className="flex flex-wrap items-start gap-3 px-5 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-900">{r.name} <span className="text-xs font-normal text-gray-400">{r.employeeId} · {r.spl ?? t("Pengajuan karyawan")}</span></p>
        <p className="text-sm text-gray-700">
          {formatDate(new Date(r.date))} · <b>{r.start}–{r.end}</b> · {num(r.planned)} <T>jam</T>
          <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold ${r.rest ? "bg-rose-50 text-rose-700" : "bg-gray-100 text-gray-600"}`}><T>{r.rest ? "Hari libur" : "Hari kerja"}</T></span>
        </p>
        {r.reason && <p className="mt-0.5 text-xs text-gray-500">{r.reason}</p>}
        {r.note && ["TIDAK_BERSEDIA", "DIBATALKAN"].includes(r.status) && <p className="mt-0.5 text-[11px] text-gray-400"><T>Alasan</T>: {r.note}</p>}
        {r.revisionStatus && <p className="mt-0.5 text-[11px] text-amber-700"><T>Revisi</T> {r.revisionEnd}: <T>{r.revisionStatus === "MENUNGGU" ? "menunggu" : r.revisionStatus === "DISETUJUI" ? "disetujui" : "ditolak"}</T></p>}
        {cancelling && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("Alasan pembatalan (wajib)")} className="h-9 min-w-48 flex-1 rounded-lg border border-gray-200 px-3 text-sm" />
            <button type="button" onClick={() => setCancelling(false)} className="rounded-full px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100"><T>Tutup</T></button>
            <button type="button" disabled={pending || !reason.trim()} onClick={cancel} className="inline-flex items-center gap-1 rounded-full bg-red-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">
              {pending ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />} <T>Batalkan lembur</T>
            </button>
          </div>
        )}
      </div>
      <div className="flex flex-col items-end gap-1 text-right">
        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${st.cls}`}><T>{st.label}</T></span>
        <p className="text-[11px] text-gray-500"><T>Pulang</T> {r.checkOut ?? "—"} · <b className="text-gray-900">{r.paid === null ? "—" : `${num(r.paid)} ${t("jam")}`}</b></p>
        {canEdit && !cancelling && r.spl && ["MENUNGGU_KARYAWAN", "DISETUJUI"].includes(r.status) && !r.checkOut && (
          <button type="button" onClick={() => setCancelling(true)} className="text-xs text-rose-600 hover:underline"><T>Batalkan</T></button>
        )}
      </div>
    </li>
  );
}

export function RevisionCard({ item: r, canEdit }: { item: AdminOvertime; canEdit: boolean }) {
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

// ─── Buat SPL ──────────────────────────────────────────────────────────────
type Line = { key: number; userId: string; startTime: string; endTime: string; reason: string };
let seq = 0;

function SplForm({ employees, rules, onDone }: { employees: EmployeePick[]; rules: SplRules; onDone: () => void }) {
  const t = useT();
  const router = useRouter();
  const [date, setDate] = useState("");
  const [def, setDef] = useState({ startTime: "17:00", endTime: "20:00", reason: "" });
  const [lines, setLines] = useState<Line[]>([]);
  const [pick, setPick] = useState("");
  const [dept, setDept] = useState("");
  const [check, setCheck] = useState<{ rows: SplRowCheck[]; error?: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const [pending, start] = useTransition();
  const byId = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const depts = useMemo(() => [...new Set(employees.map((e) => e.department).filter(Boolean))].sort() as string[], [employees]);
  const taken = new Set(lines.map((l) => l.userId));
  const options = employees.filter((e) => e.employeeId && !taken.has(e.id)).map((e) => ({ value: e.employeeId!, label: e.name }));

  const add = (ids: string[]) => setLines((ls) => [...ls, ...ids.filter((id) => !ls.some((l) => l.userId === id)).map((id) => ({ key: ++seq, userId: id, ...def }))]);
  const onPick = (v: string) => {
    const e = employees.find((x) => x.employeeId && x.employeeId.toLowerCase() === v.trim().toLowerCase());
    if (e && !taken.has(e.id)) { add([e.id]); setPick(""); } else setPick(v);
  };
  const setLine = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  // Pratinjau server (hari kerja/libur, estimasi, masalah) setelah isian berhenti diketik sebentar.
  const sig = JSON.stringify({ date, lines: lines.map(({ userId, startTime, endTime }) => [userId, startTime, endTime]) });
  useEffect(() => {
    if (!date || lines.length === 0) return;
    const h = setTimeout(async () => {
      setChecking(true);
      const r = await previewSpl({ date, rows: lines.map(({ userId, startTime, endTime, reason }) => ({ userId, startTime, endTime, reason })) }).catch(() => null);
      setChecking(false);
      if (r) setCheck(r);
    }, 500);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);
  const info = (userId: string) => (date && lines.length ? check?.rows.find((x) => x.userId === userId) : undefined);

  const totalHours = lines.reduce((a, l) => a + (info(l.userId)?.hours ?? otPlan(l.startTime, l.endTime, false).hours), 0);
  const totalEst = lines.reduce((a, l) => a + (info(l.userId)?.estimate ?? 0), 0);
  const problems = lines.filter((l) => info(l.userId)?.problem).length;

  const submit = () => start(async () => {
    const r = await createSpl({ date, rows: lines.map(({ userId, startTime, endTime, reason }) => ({ userId, startTime, endTime, reason })) });
    if (r.rows) setCheck({ rows: r.rows, error: r.error });
    if (r.error) { void showNotice(t(r.error), "error"); return; }
    void showNotice(`${r.number} ${t("terkirim ke")} ${lines.length} ${t("karyawan. Atasan mereka mendapat info.")}`);
    setLines([]); setCheck(null); setDate("");
    router.refresh();
    onDone();
  });

  return (
    <section className="rounded-2xl border border-gray-200 bg-white">
      <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 px-5 py-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-rose-400 text-white"><CalendarClock size={17} /></span>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-gray-900"><T>Buat Surat Perintah Lembur</T></h3>
          <p className="text-xs text-gray-400"><T>Satu SPL untuk satu tanggal. Tiap karyawan punya jam dan uraian pekerjaan sendiri.</T></p>
        </div>
      </div>

      <div className="space-y-4 p-5">
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr]">
          <div><label className="mb-1 block text-xs font-medium text-gray-500"><T>Tanggal lembur</T></label><DateInput value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div><label className="mb-1 block text-xs font-medium text-gray-500"><T>Jam mulai (isian awal)</T></label><input type="time" value={def.startTime} onChange={(e) => setDef({ ...def, startTime: e.target.value })} className={field} /></div>
          <div><label className="mb-1 block text-xs font-medium text-gray-500"><T>Jam selesai (isian awal)</T></label><input type="time" value={def.endTime} onChange={(e) => setDef({ ...def, endTime: e.target.value })} className={field} /></div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500"><T>Uraian pekerjaan (isian awal)</T></label>
          <div className="flex flex-wrap gap-2">
            <input value={def.reason} onChange={(e) => setDef({ ...def, reason: e.target.value })} placeholder={t("Mis. menyelesaikan fabrikasi proyek X")} className={`${field} min-w-56 flex-1`} />
            {lines.length > 0 && (
              <button type="button" onClick={() => setLines((ls) => ls.map((l) => ({ ...l, ...def })))} className="rounded-xl border border-gray-200 px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50">
                <T>Terapkan ke semua baris</T>
              </button>
            )}
          </div>
          <p className="mt-1 text-[11px] text-gray-400"><T>Isian awal dipakai untuk karyawan yang ditambahkan; tiap baris tetap bisa diubah.</T> <T>{OT_BREAK_RULE}</T></p>
        </div>

        {/* Tambah karyawan: ketik ID / nama, atau tambah satu departemen sekaligus. */}
        <div className="grid gap-2 rounded-xl border border-dashed border-gray-200 bg-gray-50/60 p-3 sm:grid-cols-[1fr_auto]">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500"><T>Tambah karyawan</T></label>
            <EmployeeCombobox id="spl-add" value={pick} onChange={onPick} options={options} />
            <p className="mt-1 text-[11px] text-gray-400"><T>Ketik ID atau nama karyawan, lalu pilih. Admin sendiri dan pimpinan puncak tidak ada di daftar.</T></p>
          </div>
          <div className="flex items-end gap-2">
            <select value={dept} onChange={(e) => setDept(e.target.value)} className="h-10 rounded-xl border border-gray-200 bg-white px-2 text-sm">
              <option value="">{t("Pilih departemen")}</option>
              {depts.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <button type="button" disabled={!dept} onClick={() => { add(employees.filter((e) => e.department === dept).map((e) => e.id)); setDept(""); }}
              className="inline-flex h-10 items-center gap-1 rounded-xl bg-ink px-3 text-xs font-semibold text-white disabled:opacity-40"><Plus size={14} /> <T>Tambah</T></button>
          </div>
        </div>

        {lines.length === 0 ? (
          <p className="rounded-xl border border-gray-100 py-8 text-center text-sm text-gray-400"><T>Belum ada karyawan di SPL ini.</T></p>
        ) : (
          <ul className="space-y-2">
            {lines.map((l, i) => {
              const e = byId.get(l.userId);
              const x = info(l.userId);
              const plan = x ? { hours: x.hours, breaks: x.breaks } : otPlan(l.startTime, l.endTime, false);
              return (
                <li key={l.key} className={`rounded-xl border p-3 ${x?.problem ? "border-rose-300 bg-rose-50/60" : "border-gray-200 bg-white"}`}>
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[11px] font-semibold text-gray-500">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-900">{e?.name} <span className="text-xs font-normal text-gray-400">{e?.employeeId}{e?.department ? ` · ${e.department}` : ""}</span></p>
                      {x && <span className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${x.rest ? "bg-rose-50 text-rose-700" : "bg-gray-100 text-gray-600"}`}><T>{x.rest ? "Hari libur" : "Hari kerja"}</T></span>}
                    </div>
                    <button type="button" onClick={() => setLines((ls) => ls.filter((y) => y.key !== l.key))} aria-label={t("Hapus")} className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-brand"><Trash2 size={14} /></button>
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-[7rem_7rem_1fr]">
                    <input type="time" value={l.startTime} aria-label={t("Jam mulai")} onChange={(ev) => setLine(l.key, { startTime: ev.target.value })} className={field} />
                    <input type="time" value={l.endTime} aria-label={t("Jam selesai")} onChange={(ev) => setLine(l.key, { endTime: ev.target.value })} className={field} />
                    <input value={l.reason} onChange={(ev) => setLine(l.key, { reason: ev.target.value })} placeholder={t("Uraian pekerjaan (wajib)")} className={field} />
                  </div>
                  <p className="mt-1.5 text-[11px] text-gray-500">
                    <T>Jam efektif</T> <b className="text-gray-800">{num(plan.hours)} <T>jam</T></b>
                    {" · "}<T>istirahat dipotong</T> {plan.breaks.length ? plan.breaks.join(", ") : "—"}
                    {x?.estimate != null && <> · <T>estimasi</T> <b className="text-gray-800">{rupiah(x.estimate)}</b></>}
                  </p>
                  {x?.problem && <p className="mt-1 text-xs font-medium text-rose-700"><T>{x.problem}</T></p>}
                </li>
              );
            })}
          </ul>
        )}

        {check?.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"><T>{check.error}</T></p>}
        {(rules.maxPeople || rules.maxEnd) && (
          <p className="text-[11px] text-gray-400">
            {rules.maxPeople && <><T>Paling banyak</T> {rules.maxPeople} <T>karyawan per SPL</T></>}
            {rules.maxPeople && rules.maxEnd && " · "}
            {rules.maxEnd && <><T>Jam selesai paling lambat</T> {rules.maxEnd}</>}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4">
          <p className="flex-1 text-sm text-gray-600">
            <b className="text-gray-900">{lines.length}</b> <T>karyawan</T> · <b className="text-gray-900">{num(totalHours)}</b> <T>jam efektif</T>
            {totalEst > 0 && <> · <T>estimasi</T> <b className="text-gray-900">{rupiah(totalEst)}</b></>}
            {checking && <Loader2 size={13} className="ml-2 inline animate-spin text-gray-400" />}
            {problems > 0 && <span className="ml-2 text-xs font-semibold text-rose-700">{problems} <T>baris perlu diperbaiki</T></span>}
          </p>
          <button type="button" disabled={pending || !date || lines.length === 0} onClick={submit}
            className="inline-flex items-center gap-1.5 rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-40">
            {pending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} <T>Kirim SPL</T>
          </button>
        </div>
        <p className="flex items-start gap-1.5 text-[11px] text-gray-400"><Wallet size={12} className="mt-0.5 shrink-0" /><T>Estimasi memakai rumus komponen lembur di Payroll & Benefit, dibayar per 1 jam penuh. Atasan langsung mendapat info; atasan di atasnya sampai pimpinan puncak mendapat info beserta estimasi dan bisa membatalkan.</T></p>
      </div>
    </section>
  );
}

// ─── Pengaturan SPL ────────────────────────────────────────────────────────
function RulesForm({ rules }: { rules: SplRules }) {
  const t = useT();
  const [maxEnd, setMaxEnd] = useState(rules.maxEnd ?? "");
  const [maxPeople, setMaxPeople] = useState(rules.maxPeople ? String(rules.maxPeople) : "");
  const [pending, start] = useTransition();
  const save = () => start(async () => {
    const r = await saveSplRules({ maxEnd: maxEnd || null, maxPeople: maxPeople ? Number(maxPeople) : null });
    void showNotice(r.error ? t(r.error) : t("Pengaturan SPL tersimpan."), r.error ? "error" : undefined);
  });
  return (
    <section className="rounded-2xl border border-gray-200 bg-white">
      <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 px-5 py-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-ink to-slate-500 text-white"><Settings2 size={17} /></span>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-gray-900"><T>Pengaturan SPL</T></h3>
          <p className="text-xs text-gray-400"><T>Batas saat membuat SPL. Kosongkan jika tidak dibatasi.</T></p>
        </div>
      </div>
      <div className="grid gap-4 p-5 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500"><T>Jam selesai lembur paling lambat</T></label>
          <input type="time" value={maxEnd} onChange={(e) => setMaxEnd(e.target.value)} className={field} />
          <p className="mt-1 text-[11px] text-gray-400"><T>Mis. 23:00. Lembur yang lewat tengah malam ikut ditolak bila batas diisi.</T></p>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500"><T>Maksimal karyawan per SPL</T></label>
          <input type="number" min={1} value={maxPeople} onChange={(e) => setMaxPeople(e.target.value)} className={field} />
        </div>
      </div>
      <div className="flex justify-end border-t border-gray-100 px-5 py-3">
        <button type="button" disabled={pending} onClick={save} className="inline-flex items-center gap-1.5 rounded-full bg-ink px-5 py-2 text-sm font-semibold text-white disabled:opacity-40">
          {pending && <Loader2 size={14} className="animate-spin" />} <T>Simpan</T>
        </button>
      </div>
    </section>
  );
}
