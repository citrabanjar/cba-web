"use client";

import { useEffect, useState, useTransition } from "react";
import { CalendarClock, ChevronDown, ChevronLeft, ChevronRight, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { T, useT } from "@/components/i18n";
import { formatDate } from "@/lib/utils";
import { assignSchedule, deleteEmployeeSchedule, loadShiftMonth, saveShiftDays } from "../../schedule/actions";
import { proposedText } from "@/lib/approval-text";

export type ScheduleRow = {
  id: string; type: string; effectiveDate: Date; note: string | null; createdBy: string | null;
  pattern: { id: string; name: string } | null;
};
type PatternOption = { id: string; name: string; cycleDays: number };

const label = (s: ScheduleRow) => (s.type === "MANUAL" ? "Jadwal Manual" : s.pattern?.name ?? "—");
type MonthShift = { id: string; code: string; name: string; color: string; isOff: boolean };
const DOW = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
const pad = (n: number) => String(n).padStart(2, "0");
const shiftMonth = (ym: string, d: number) => { const [y, m] = ym.split("-").map(Number); const x = new Date(Date.UTC(y, m - 1 + d, 1)); return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}`; };
const MONTH_ID = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

// Isian shift per tanggal (Jadwal Manual) langsung dari profil karyawan; sama dengan baris karyawan ini di Jadwal Bulanan.
function ManualMonth({ userId, month, setMonth, edits, setEdits }: {
  userId: string; month: string; setMonth: (m: string) => void;
  edits: Record<string, string | null>; setEdits: (f: (e: Record<string, string | null>) => Record<string, string | null>) => void;
}) {
  const t = useT();
  const [loaded, setLoaded] = useState<{ month: string; shifts: MonthShift[]; days: Record<string, string>; holidays: Record<string, string> } | null>(null);
  const data = loaded?.month === month ? loaded : null; // bulan lain sedang dimuat
  const [fill, setFill] = useState("");
  useEffect(() => {
    let live = true;
    loadShiftMonth(userId, month).then((r) => { if (live && !r.error) setLoaded({ month, shifts: r.shifts ?? [], days: r.days ?? {}, holidays: r.holidays ?? {} }); });
    return () => { live = false; };
  }, [userId, month]);
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const dates = Array.from({ length: last }, (_, i) => `${month}-${pad(i + 1)}`);
  const value = (d: string) => (d in edits ? edits[d] ?? "" : data?.days[d] ?? "");
  const byId = new Map((data?.shifts ?? []).map((s) => [s.id, s]));
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => setMonth(shiftMonth(month, -1))} className="rounded-full p-1 text-gray-500 hover:bg-gray-100"><ChevronLeft size={16} /></button>
        <span className="text-sm font-semibold text-gray-900">{t(MONTH_ID[m - 1])} {y}</span>
        <button type="button" onClick={() => setMonth(shiftMonth(month, 1))} className="rounded-full p-1 text-gray-500 hover:bg-gray-100"><ChevronRight size={16} /></button>
      </div>
      {!data ? <p className="py-6 text-center text-xs text-gray-400"><Loader2 size={14} className="mr-1 inline animate-spin" /><T>Memuat…</T></p> : data.shifts.length === 0 ? (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800"><T>Belum ada shift aktif. Buat dulu di Jadwal → Shift.</T></p>
      ) : (
        <>
          <div className="flex items-center gap-2 text-xs">
            <select value={fill} onChange={(e) => setFill(e.target.value)} className="h-8 flex-1 rounded-lg border border-input bg-white px-2">
              <option value="">{t("Isi tanggal kosong dengan…")}</option>
              {data.shifts.map((s) => <option key={s.id} value={s.id}>{s.code} · {s.name}</option>)}
            </select>
            <button type="button" disabled={!fill} onClick={() => setEdits((e) => ({ ...e, ...Object.fromEntries(dates.filter((d) => !value(d) && !data.holidays[d]).map((d) => [d, fill])) }))}
              className="h-8 rounded-full border border-gray-200 px-3 font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40"><T>Isi</T></button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-gray-400">{DOW.map((d) => <span key={d}><T>{d}</T></span>)}</div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: lead }, (_, i) => <span key={`x${i}`} />)}
            {dates.map((d) => {
              const v = value(d), s = v ? byId.get(v) : undefined, hol = data.holidays[d];
              return (
                <label key={d} title={hol ?? (s ? s.name : t("Belum diisi"))}
                  className={`relative flex h-11 flex-col items-center justify-center rounded-lg border text-[10px] ${d in edits ? "border-brand" : "border-gray-100"} ${hol ? "bg-gray-100" : s ? "" : "bg-amber-50"}`}
                  style={s && !hol ? { background: `${s.color}22` } : undefined}>
                  <span className="text-gray-500">{Number(d.slice(8))}</span>
                  <span className="font-bold" style={s ? { color: s.color } : undefined}>{hol ? "OFF" : s ? s.code : "–"}</span>
                  <select value={v} onChange={(e) => setEdits((x) => ({ ...x, [d]: e.target.value || null }))} className="absolute inset-0 cursor-pointer opacity-0">
                    <option value="">—</option>
                    {data.shifts.map((o) => <option key={o.id} value={o.id}>{o.code} · {o.name}</option>)}
                  </select>
                </label>
              );
            })}
          </div>
          <p className="text-[11px] text-gray-400"><T>Klik tanggal untuk memilih shift. Hari libur di Kalender Libur otomatis OFF.</T></p>
        </>
      )}
    </div>
  );
}

// Jadwal kerja karyawan: jadwal yang berlaku sekarang, riwayatnya, dan form untuk mengganti.
export default function ScheduleCard({
  userId, schedules, patterns, canEdit,
}: {
  userId: string; schedules: ScheduleRow[]; patterns: PatternOption[]; canEdit: boolean;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [form, setForm] = useState({ type: "POLA" as "POLA" | "MANUAL", patternId: patterns[0]?.id ?? "", effectiveDate: "", note: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [month, setMonth] = useState(() => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 7));
  const [edits, setEdits] = useState<Record<string, string | null>>({});

  const [todayKey] = useState(() => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10));
  const current = schedules.find((s) => new Date(s.effectiveDate).toISOString().slice(0, 10) <= todayKey);

  // Sudah Jadwal Manual: tanggal mulai boleh kosong bila hanya mengisi shift per tanggal.
  const alreadyManual = current?.type === "MANUAL";
  function save() {
    setError(null);
    start(async () => {
      if (form.type === "POLA" || form.effectiveDate || !alreadyManual) {
        const r = await assignSchedule([userId], form);
        if (r.error) { setError(r.error); return; }
      }
      if (form.type === "MANUAL") {
        const changes = Object.entries(edits).map(([date, shiftId]) => ({ userId, date, shiftId }));
        if (changes.length) {
          const r = await saveShiftDays(changes);
          if (r.error) { setError(r.error); return; }
          if ("proposed" in r && typeof r.proposed === "string") window.alert(proposedText(r.proposed));
        }
      }
      setEdits({});
      setOpen(false);
    });
  }

  return (
    <section className="bg-white rounded-2xl border border-gray-200 p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400"><T>Jadwal Kerja</T></p>
        {canEdit && (
          <button type="button" onClick={() => { setError(null); setEdits({}); setForm((f) => ({ ...f, type: current?.type === "MANUAL" ? "MANUAL" : f.type })); setOpen(true); }}
            className="inline-flex h-7 items-center gap-1 rounded-full bg-ink px-3 text-xs font-semibold text-white hover:bg-ink/85">
            <Plus size={13} /> <T>Atur</T>
          </button>
        )}
      </div>
      {schedules.length === 0 ? (
        <p className="mt-3 text-sm text-gray-400"><T>Belum ada jadwal kerja</T></p>
      ) : (
        <>
          <p className="mt-2 flex items-center gap-2 text-base font-bold text-gray-900">
            <CalendarClock size={16} className="shrink-0 text-emerald-600" />
            <span className="truncate">{current ? <T>{label(current)}</T> : <T>Belum berlaku</T>}</span>
          </p>
          {current && <p className="mt-0.5 text-xs text-gray-500"><T>sejak</T> {formatDate(current.effectiveDate)}</p>}
          <button type="button" onClick={() => setShowHistory((v) => !v)}
            className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-900">
            <T>Riwayat</T> ({schedules.length})
            <ChevronDown size={13} className={`transition-transform ${showHistory ? "rotate-180" : ""}`} />
          </button>
          {showHistory && (
            <ul className="mt-2 divide-y divide-gray-100 border-t border-gray-100">
              {schedules.map((s) => (
                <li key={s.id} className="flex items-center gap-2 py-1.5 text-xs">
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold tabular-nums text-gray-900">{formatDate(s.effectiveDate)}</span>
                    <span className="block truncate text-gray-600">
                      <T>{label(s)}</T>
                      {(s.note || s.createdBy) && <span className="text-gray-400"> · {[s.note, s.createdBy].filter(Boolean).join(" · ")}</span>}
                    </span>
                  </span>
                  {canEdit && (
                    <button type="button" disabled={pending} aria-label={t("Hapus")}
                      onClick={() => { if (window.confirm(t("Hapus jadwal ini?"))) start(async () => { await deleteEmployeeSchedule(s.id); }); }}
                      className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-brand disabled:opacity-30">
                      <Trash2 size={13} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className={`max-h-[90vh] overflow-y-auto ${form.type === "MANUAL" ? "sm:max-w-lg" : "sm:max-w-md"}`}>
          <DialogHeader><DialogTitle><T>Atur Jadwal Kerja</T></DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-1 rounded-full bg-gray-100 p-1">
              {([["POLA", "Pola Kerja"], ["MANUAL", "Jadwal Manual"]] as const).map(([k, v]) => (
                <button key={k} type="button" onClick={() => setForm({ ...form, type: k })}
                  className={`flex-1 rounded-full px-3 py-1.5 text-xs font-semibold ${form.type === k ? "bg-ink text-white" : "text-gray-500"}`}>
                  <T>{v}</T>
                </button>
              ))}
            </div>
            {form.type === "POLA" ? (
              <div className="space-y-1.5">
                <Label className="text-xs"><T>Pola Kerja</T></Label>
                <select value={form.patternId} onChange={(e) => setForm({ ...form, patternId: e.target.value })}
                  className="h-9 w-full rounded-lg border border-input bg-white px-2 text-sm">
                  {patterns.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            ) : (
              <ManualMonth userId={userId} month={month} setMonth={setMonth} edits={edits} setEdits={setEdits} />
            )}
            <div className="space-y-1.5">
              <Label className="text-xs"><T>Mulai berlaku</T>{form.type === "MANUAL" && alreadyManual && <span className="font-normal text-gray-400"> · <T>kosongkan bila hanya mengisi shift</T></span>}</Label>
              <Input type="date" value={form.effectiveDate} onChange={(e) => setForm({ ...form, effectiveDate: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs"><T>Catatan</T></Label>
              <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </div>
            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"><T>{error}</T></p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}><T>Batal</T></Button>
            <Button onClick={save} disabled={pending} className="gap-1.5">
              {pending && <Loader2 size={15} className="animate-spin" />} <T>Simpan</T>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
