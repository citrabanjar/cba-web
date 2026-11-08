"use client";

import { useState, useTransition } from "react";
import { CalendarClock, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { T, useT } from "@/components/i18n";
import { formatDate } from "@/lib/utils";
import { assignSchedule, deleteEmployeeSchedule } from "../../schedule/actions";

export type ScheduleRow = {
  id: string; type: string; effectiveDate: Date; note: string | null; createdBy: string | null;
  pattern: { id: string; name: string } | null;
};
type PatternOption = { id: string; name: string; cycleDays: number };

const label = (s: ScheduleRow) => (s.type === "MANUAL" ? "Jadwal Manual" : s.pattern?.name ?? "—");

// Jadwal kerja karyawan: jadwal yang berlaku sekarang, riwayatnya, dan form untuk mengganti.
export default function ScheduleCard({
  userId, schedules, patterns, canEdit,
}: {
  userId: string; schedules: ScheduleRow[]; patterns: PatternOption[]; canEdit: boolean;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ type: "POLA" as "POLA" | "MANUAL", patternId: patterns[0]?.id ?? "", effectiveDate: "", note: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const [todayKey] = useState(() => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10));
  const current = schedules.find((s) => new Date(s.effectiveDate).toISOString().slice(0, 10) <= todayKey);

  function save() {
    setError(null);
    start(async () => {
      const r = await assignSchedule([userId], form);
      if (r.error) setError(r.error);
      else setOpen(false);
    });
  }

  return (
    <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="section-head flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="section-icon"><CalendarClock size={17} /></span>
          <h3 className="font-semibold text-[15px]"><T>Jadwal Kerja</T></h3>
        </div>
        {canEdit && (
          <button type="button" onClick={() => { setError(null); setOpen(true); }}
            className="inline-flex h-8 items-center gap-1.5 rounded-full bg-ink px-4 text-xs font-semibold text-white hover:bg-ink/85">
            <Plus size={13} /> <T>Atur Jadwal</T>
          </button>
        )}
      </div>
      <div className="p-5">
        {schedules.length === 0 ? (
          <p className="text-sm text-gray-400"><T>Belum ada jadwal kerja. Tempel pola kerja supaya shift harian muncul di kalender.</T></p>
        ) : (
          <div className="space-y-3">
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700"><T>Berlaku sekarang</T></p>
              <p className="mt-0.5 font-bold text-gray-900">{current ? <T>{label(current)}</T> : <T>Belum berlaku</T>}</p>
              {current && <p className="text-xs text-gray-500"><T>Mulai</T> {formatDate(current.effectiveDate)}</p>}
            </div>
            <ul className="space-y-2">
              {schedules.map((s) => (
                <li key={s.id} className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50/70 px-3 py-2.5 text-sm">
                  <span className="w-28 shrink-0 font-semibold tabular-nums text-gray-900">{formatDate(s.effectiveDate)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-gray-800"><T>{label(s)}</T></span>
                    {(s.note || s.createdBy) && (
                      <span className="block truncate text-xs text-gray-400">{[s.note, s.createdBy].filter(Boolean).join(" · ")}</span>
                    )}
                  </span>
                  {canEdit && (
                    <button type="button" disabled={pending} aria-label={t("Hapus")}
                      onClick={() => { if (window.confirm(t("Hapus jadwal ini?"))) start(async () => { await deleteEmployeeSchedule(s.id); }); }}
                      className="rounded-full p-1.5 text-gray-400 hover:bg-white hover:text-brand disabled:opacity-30">
                      <Trash2 size={14} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
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
              <p className="rounded-xl bg-gray-50 px-3 py-2 text-xs text-gray-500">
                <T>Shift diisi per tanggal di tabel jadwal bulanan (untuk Security atau jadwal tidak teratur). Tabel itu menyusul di tahap berikutnya.</T>
              </p>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs"><T>Mulai berlaku</T></Label>
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
