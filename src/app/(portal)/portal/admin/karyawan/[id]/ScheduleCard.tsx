"use client";

import { useState, useTransition } from "react";
import { CalendarClock, ChevronDown, Loader2, Plus, Trash2 } from "lucide-react";
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
  const [showHistory, setShowHistory] = useState(false);
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
    <section className="bg-white rounded-2xl border border-gray-200 p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400"><T>Jadwal Kerja</T></p>
        {canEdit && (
          <button type="button" onClick={() => { setError(null); setOpen(true); }}
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
                <T>Shift diisi per tanggal di menu Jadwal Bulanan (untuk Security atau jadwal tidak teratur).</T>
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
