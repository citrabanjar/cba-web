"use client";

import { proposedText } from "@/lib/approval-text";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarClock, CalendarOff, CalendarRange, ChevronDown, ChevronRight, Clock, Coffee, GripVertical, Loader2, MapPin, Pencil, Plus, Repeat, Scale, Timer, Trash2, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { T, useT } from "@/components/i18n";
import { useCanApply, useCanEdit } from "@/components/portal/edit-access";
import { formatDate, formatDateTime } from "@/lib/utils";
import LocationTab, { type Location } from "./LocationTab";
import RosterTab from "./RosterTab";
import type { loadRoster } from "./roster";
import AssignDialog, { type EmployeeOption } from "./AssignDialog";
import {
  deleteHoliday, deletePattern, deleteShift, saveHoliday, savePattern, saveRule, saveShift,
  type BreakTime, type PatternInput, type RuleInput, type ShiftInput, reorderShifts } from "./actions";
import { toast } from "@/components/portal/Toast";
import { askConfirm, showNotice } from "@/components/portal/Confirm";

type Shift = Omit<ShiftInput, "startTime" | "endTime"> & {
  id: string; used: number; startTime: string | null; endTime: string | null;
};
type Pattern = Omit<PatternInput, "description"> & { id: string; description: string | null; assigned: number };
type Holiday = { id: string; date: string; name: string; type: string };
type Rule = RuleInput & { updatedBy: string | null; updatedAt: Date | null };

const TABS = [
  { key: "shift", label: "Shift", icon: Clock },
  { key: "pola", label: "Pola Kerja", icon: Repeat },
  { key: "libur", label: "Kalender Libur", icon: CalendarOff },
  { key: "lokasi", label: "Lokasi Absen", icon: MapPin },
  { key: "aturan", label: "Aturan Kehadiran", icon: Scale },
  { key: "jadwal", label: "Jadwal Bulanan", icon: CalendarRange },
] as const;
type Tab = (typeof TABS)[number]["key"];

const HOLIDAY_TYPE: Record<string, { label: string; cls: string }> = {
  NASIONAL: { label: "Libur Nasional", cls: "bg-rose-50 text-rose-700 border-rose-200" },
  CUTI_BERSAMA: { label: "Cuti Bersama", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  PERUSAHAAN: { label: "Libur Perusahaan", cls: "bg-sky-50 text-sky-700 border-sky-200" },
};
const WEEKDAYS = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const COLORS = ["#10b981", "#0ea5e9", "#6366f1", "#a855f7", "#f59e0b", "#ef4444", "#be353f", "#9ca3af"];

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
const span = (start: string, end: string) => {
  const d = toMin(end) - toMin(start);
  return d <= 0 ? d + 1440 : d;
};
// Jam kerja efektif = lama shift dikurangi istirahat.
function effective(s: { isOff: boolean; startTime: string | null; endTime: string | null; breaks: BreakTime[] }) {
  if (s.isOff || !s.startTime || !s.endTime) return 0;
  const rest = s.breaks.reduce((n, b) => n + (b.start && b.end ? span(b.start, b.end) : 0), 0);
  return span(s.startTime, s.endTime) - rest;
}
const fmtDur = (m: number) => `${Math.floor(m / 60)} jam${m % 60 ? ` ${m % 60} mnt` : ""}`;

function SectionCard({
  icon: Icon, title, desc, action, children,
}: {
  icon: React.ElementType; title: string; desc?: string; action?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="section-head flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div className="flex items-center gap-3 min-w-0">
          <span className="section-icon"><Icon size={17} /></span>
          <div className="min-w-0">
            <h3 className="font-semibold text-[15px]"><T>{title}</T></h3>
            {desc && <p className="text-xs text-gray-500"><T>{desc}</T></p>}
          </div>
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function PillButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className="inline-flex h-9 items-center gap-1.5 rounded-full bg-ink px-4 text-xs font-semibold text-white hover:bg-ink/85">
      {children}
    </button>
  );
}

function ErrorText({ text }: { text: string | null }) {
  if (!text) return null;
  return <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"><T>{text}</T></p>;
}

function NumberField({
  label, hint, value, onChange, disabled,
}: {
  label: string; hint?: string; value: number; onChange: (n: number) => void; disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs"><T>{label}</T></Label>
      <div className="relative">
        <Input type="number" min={0} value={Number.isFinite(value) ? value : ""} className="pr-14" disabled={disabled}
          onChange={(e) => onChange(e.target.value === "" ? NaN : Number(e.target.value))} />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400"><T>menit</T></span>
      </div>
      {hint && <p className="text-[11px] text-gray-400"><T>{hint}</T></p>}
    </div>
  );
}

function Toggle({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean }) {
  return (
    <label className={`flex items-start justify-between gap-4 rounded-xl border border-gray-100 bg-gray-50/70 px-4 py-3 ${disabled ? "cursor-default" : "cursor-pointer"}`}>
      <span>
        <span className="block text-sm font-semibold text-gray-900"><T>{label}</T></span>
        {hint && <span className="mt-0.5 block text-xs text-gray-500"><T>{hint}</T></span>}
      </span>
      <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} disabled={disabled}
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-60 ${checked ? "bg-emerald-500" : "bg-gray-300"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? "left-[22px]" : "left-0.5"}`} />
      </button>
    </label>
  );
}

// ─── Shift ──────────────────────────────────────────────────────────────────

const EMPTY_SHIFT: ShiftInput = {
  code: "", name: "", color: COLORS[0], isOff: false, startTime: "08:00", endTime: "17:00",
  breaks: [{ start: "12:00", end: "13:00" }], lateTolerance: 5, earlyLeaveTolerance: 0,
  checkInEarliest: null, checkOutLatest: null, overtimeStartAfter: 30, overtimeMinimum: 60,
  overtimeRounding: 30, isActive: true,
};

// Formulir shift di panel kanan (bukan dialog), seperti Jenis Cuti & Komponen Payroll.
function ShiftForm({ shift, onClose, onDirty }: { shift: Shift | "new"; onClose: () => void; onDirty: (d: boolean) => void }) {
  const t = useT();
  const initial = useMemo<ShiftInput>(() =>
    shift === "new" ? EMPTY_SHIFT : { ...shift, startTime: shift.startTime ?? "", endTime: shift.endTime ?? "" }, [shift]);
  const [form, setForm] = useState<ShiftInput>(initial);
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  useEffect(() => { onDirty(dirty); }, [dirty, onDirty]);
  const set = <K extends keyof ShiftInput>(k: K, v: ShiftInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const overnight = !form.isOff && form.startTime && form.endTime && toMin(form.endTime) <= toMin(form.startTime);

  function save() {
    start(async () => {
      const r = await saveShift(shift === "new" ? null : shift.id, form);
      if (r.error) { void showNotice(t(r.error), "error"); return; }
      onDirty(false);
      void showNotice(r.proposed ? proposedText(r.proposed) : t("Shift tersimpan."));
      if (shift === "new") onClose();
    });
  }
  function cancel() {
    if (shift === "new") { onDirty(false); onClose(); return; }
    setForm(initial);
  }

  return (
    <div>
      <div className="mb-4 flex justify-end gap-2">
        <Button variant="outline" disabled={pending || (shift !== "new" && !dirty)} onClick={cancel}><T>Batal</T></Button>
        <Button onClick={save} disabled={pending || (shift !== "new" && !dirty)} className="gap-1.5">
          {pending && <Loader2 size={15} className="animate-spin" />} <T>Simpan</T>
        </Button>
      </div>
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-[110px_1fr]">
            <div className="space-y-1.5">
              <Label className="text-xs"><T>Kode</T></Label>
              <Input value={form.code} maxLength={6} placeholder="N" onChange={(e) => set("code", e.target.value.toUpperCase())} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs"><T>Nama Shift</T></Label>
              <Input value={form.name} placeholder={t("Contoh: Normal, Pagi, Malam")} onChange={(e) => set("name", e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs"><T>Warna</T></Label>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button key={c} type="button" onClick={() => set("color", c)} aria-label={c}
                  className={`h-8 w-8 rounded-full ring-offset-2 ${form.color === c ? "ring-2 ring-ink" : ""}`}
                  style={{ background: c }} />
              ))}
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <Toggle checked={form.isOff} onChange={(v) => set("isOff", v)} label="Shift libur (OFF)" hint="Hari tanpa jam kerja." />
            <Toggle checked={form.isActive} onChange={(v) => set("isActive", v)} label="Aktif" hint="Shift nonaktif tidak bisa dipilih di pola kerja." />
          </div>

          {!form.isOff && (
            <>
              <div>
                <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-900"><Clock size={15} /> <T>Jam Kerja</T></p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs"><T>Jam Masuk</T></Label>
                    <Input type="time" value={form.startTime} onChange={(e) => set("startTime", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs"><T>Jam Pulang</T></Label>
                    <Input type="time" value={form.endTime} onChange={(e) => set("endTime", e.target.value)} />
                  </div>
                  <div className="rounded-xl bg-gray-50 px-3 py-2">
                    <p className="text-[11px] text-gray-500"><T>Jam kerja efektif</T></p>
                    <p className="text-sm font-bold text-gray-900">{fmtDur(effective({ ...form, startTime: form.startTime || null, endTime: form.endTime || null }))}</p>
                    {overnight && <p className="text-[11px] font-medium text-indigo-600"><T>Lewat tengah malam</T></p>}
                  </div>
                </div>
              </div>

              <div>
                <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-900"><Coffee size={15} /> <T>Jam Istirahat</T></p>
                <div className="space-y-2">
                  {form.breaks.map((b, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input type="time" value={b.start} aria-label={t("Mulai istirahat")}
                        onChange={(e) => set("breaks", form.breaks.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))} />
                      <span className="text-gray-400">–</span>
                      <Input type="time" value={b.end} aria-label={t("Selesai istirahat")}
                        onChange={(e) => set("breaks", form.breaks.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))} />
                      <button type="button" onClick={() => set("breaks", form.breaks.filter((_, j) => j !== i))}
                        aria-label={t("Hapus")} className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-brand">
                        <X size={15} />
                      </button>
                    </div>
                  ))}
                  <button type="button" onClick={() => set("breaks", [...form.breaks, { start: "", end: "" }])}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand hover:underline">
                    <Plus size={13} /> <T>Tambah jam istirahat</T>
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Batas jam absen: dari jam shift, atau dari jam SPL bila ada SPL "Bersedia" (shift OFF: hanya jam SPL). */}
          <div>
            <p className="mb-1 flex items-center gap-2 text-sm font-semibold text-gray-900"><CalendarClock size={15} /> <T>Batas Jam Absen</T></p>
            <p className="mb-2 text-[11px] text-gray-400"><T>{form.isOff ? "Berlaku untuk lembur (SPL) di hari libur. Kosongkan jika tidak dibatasi." : "Kosongkan jika tidak dibatasi."}</T></p>
            <div className="grid gap-3 sm:grid-cols-2">
              <NumberField label={form.isOff ? "Absen masuk dibuka sebelum jam lembur" : "Absen masuk dibuka sebelum jam masuk"} value={form.checkInEarliest ?? NaN}
                onChange={(n) => set("checkInEarliest", Number.isFinite(n) ? n : null)}
                hint="Batas paling awal check-in." />
              <NumberField label={form.isOff ? "Absen pulang ditutup setelah jam lembur" : "Absen pulang ditutup setelah jam pulang"} value={form.checkOutLatest ?? NaN}
                onChange={(n) => set("checkOutLatest", Number.isFinite(n) ? n : null)}
                hint="Batas paling akhir check-out." />
            </div>
          </div>

          {!form.isOff && (
            <>
              <div>
                <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-900"><Timer size={15} /> <T>Toleransi</T></p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <NumberField label="Toleransi terlambat" hint="Masuk lewat dari ini dihitung terlambat." value={form.lateTolerance} onChange={(n) => set("lateTolerance", n)} />
                  <NumberField label="Toleransi pulang cepat" hint="Pulang lebih awal dari ini dihitung pulang cepat." value={form.earlyLeaveTolerance} onChange={(n) => set("earlyLeaveTolerance", n)} />
                </div>
              </div>

              {/* Rentang absen tidak dipakai (diganti kunci lupa absen), dan aturan lembur
                  dipindah ke Setup Lembur. Nilainya tetap tersimpan di database. */}
            </>
          )}
        </div>
    </div>
  );
}

function ShiftTab({ shifts }: { shifts: Shift[] }) {
  const t = useT();
  const canEdit = useCanEdit(); // hak lihat saja: tanpa tambah/ubah/hapus/geser urutan
  const [creating, setCreating] = useState(false); // formulir shift baru di panel kanan
  const [dirty, setDirty] = useState(false); // ada isian yang belum disimpan
  const [showForm, setShowForm] = useState(false); // formulir ubah: dibuka / disembunyikan
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Urutan daftar di layar. Ikut data server kalau daftar shift berubah (tambah/hapus).
  const serverKey = shifts.map((s) => s.id).join(",");
  const [order, setOrder] = useState(() => shifts.map((s) => s.id));
  const [syncedKey, setSyncedKey] = useState(serverKey);
  if (syncedKey !== serverKey) { setSyncedKey(serverKey); setOrder(shifts.map((s) => s.id)); }
  const [dragId, setDragId] = useState<string | null>(null);
  const byId = new Map(shifts.map((s) => [s.id, s]));
  const ordered = order.map((id) => byId.get(id)).filter((s): s is Shift => !!s);
  const selected = ordered.find((s) => s.id === selectedId) ?? ordered[0];

  async function leave(go: () => void) {
    if (dirty && !(await askConfirm(t("Perubahan belum disimpan. Tinggalkan tanpa menyimpan?")))) return;
    setDirty(false);
    go();
  }

  // Saat diseret melewati baris lain, baris yang diseret langsung pindah ke posisi itu.
  function moveOver(targetId: string) {
    if (!dragId || dragId === targetId) return;
    setOrder((prev) => {
      const next = prev.filter((id) => id !== dragId);
      next.splice(next.indexOf(targetId) + (prev.indexOf(dragId) < prev.indexOf(targetId) ? 1 : 0), 0, dragId);
      return next;
    });
  }
  function finishDrag() {
    if (!dragId) return;
    setDragId(null);
    if (order.join(",") === serverKey) return;
    start(async () => {
      const r = await reorderShifts(order);
      if (r.error) { void showNotice(t(r.error), "error"); setOrder(shifts.map((s) => s.id)); }
    });
  }

  async function remove(s: Shift) {
    if (!await askConfirm(t("Hapus shift ini?"))) return;
    start(async () => {
      const r = await deleteShift(s.id);
      if (r.error) void showNotice(t(r.error), "error");
      else if (r.proposed) void showNotice(proposedText(r.proposed));
    });
  }

  return (
    <SectionCard icon={Clock} title="Master Shift" desc="Jam kerja, istirahat, dan toleransi per shift."
      action={canEdit && <PillButton onClick={() => leave(() => { setCreating(true); setShowForm(true); })}><Plus size={14} /> <T>Tambah Shift</T></PillButton>}>
      {/* Daftar shift di kiri (bisa digeser untuk urutan), rincian shift terpilih di kanan. */}
      <div className="grid gap-4 md:grid-cols-[18rem_1fr]">
        <div className="h-fit">
          <nav className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
            {ordered.map((s) => {
              const on = !creating && s.id === selected?.id;
              return (
                <button key={s.id} type="button" draggable={canEdit}
                  onClick={() => { if (!on) leave(() => { setCreating(false); setSelectedId(s.id); }); }}
                  onDragStart={canEdit ? (e) => { setDragId(s.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", s.id); } : undefined}
                  onDragOver={canEdit ? (e) => { e.preventDefault(); moveOver(s.id); } : undefined}
                  onDrop={canEdit ? (e) => { e.preventDefault(); finishDrag(); } : undefined}
                  onDragEnd={canEdit ? finishDrag : undefined}
                  className={`flex w-full items-center gap-2.5 border-b border-gray-100 px-3 py-2.5 text-left last:border-b-0 ${on ? "bg-brand/10" : "hover:bg-gray-50"} ${s.isActive ? "" : "opacity-55"} ${dragId === s.id ? "opacity-40" : ""}`}>
                  {canEdit && <GripVertical size={14} className="shrink-0 cursor-grab text-gray-300" />}
                  <span className="flex h-7 min-w-9 items-center justify-center rounded-lg px-1.5 text-[10px] font-bold text-white" style={{ background: s.color }}>{s.code}</span>
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-sm ${on ? "font-semibold text-brand" : "text-gray-700"}`}>{s.name}</span>
                    <span className="block text-[11px] text-gray-400">{s.isOff ? <T>Hari libur</T> : `${s.startTime} – ${s.endTime}`}</span>
                  </span>
                  <ChevronRight size={14} className={on ? "text-brand" : "text-gray-300"} />
                </button>
              );
            })}
            {ordered.length === 0 && <p className="px-4 py-8 text-center text-sm text-gray-400"><T>Belum ada shift.</T></p>}
          </nav>
          {canEdit && ordered.length > 1 && (
            <p className="mt-2 flex items-center gap-1.5 px-1 text-[11px] text-gray-400">
              <GripVertical size={13} /> <T>Tahan dan geser untuk mengatur urutan. Urutan ini dipakai di semua daftar shift.</T>
              {pending && <Loader2 size={12} className="animate-spin" />}
            </p>
          )}
        </div>

        {creating && canEdit && (
          <div className="relative h-fit overflow-hidden rounded-2xl border border-gray-200 bg-white">
            <span className="absolute inset-y-0 left-0 w-1.5 bg-ink" />
            <div className="p-4 pl-5">
              <p className="mb-4 font-bold text-gray-900"><T>Tambah Shift</T></p>
              <ShiftForm key="new" shift="new" onDirty={setDirty} onClose={() => { setDirty(false); setCreating(false); }} />
            </div>
          </div>
        )}
        {!creating && selected && (() => {
          const s = selected;
          return (
            <div className="relative h-fit overflow-hidden rounded-2xl border border-gray-200 bg-white">
              <span className="absolute inset-y-0 left-0 w-1.5" style={{ background: s.color }} />
              <div className="p-4 pl-5">
                <div className={`flex items-start gap-3 ${s.isActive ? "" : "opacity-55"}`}>
                  <span className="flex h-9 min-w-12 items-center justify-center rounded-xl px-2 text-[11px] font-bold text-white" style={{ background: s.color }}>{s.code}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-gray-900">{s.name}</p>
                    <p className="text-xs text-gray-500">
                      {s.isOff ? <T>Hari libur</T> : `${s.startTime} – ${s.endTime}`}
                      {!s.isActive && <> · <T>Nonaktif</T></>}
                    </p>
                  </div>
                  {canEdit && <button type="button" onClick={() => remove(s)} disabled={pending} aria-label={t("Hapus")} className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-brand disabled:opacity-30"><Trash2 size={14} /></button>}
                </div>
                {!s.isOff && (
                  <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                    {[
                      ["Efektif", fmtDur(effective(s))],
                      ["Istirahat", s.breaks.length ? s.breaks.map((b) => `${b.start}–${b.end}`).join(", ") : "—"],
                      ["Toleransi telat", `${s.lateTolerance} mnt`],
                      ["Pulang cepat", `${s.earlyLeaveTolerance} mnt`],
                      ["Absen masuk dibuka", s.checkInEarliest == null ? t("Tanpa batas") : `${s.checkInEarliest} ${t("mnt sebelum")}`],
                      ["Absen pulang ditutup", s.checkOutLatest == null ? t("Tanpa batas") : `${s.checkOutLatest} ${t("mnt setelah")}`],
                    ].map(([k, v]) => (
                      <div key={k} className="rounded-lg bg-gray-50 px-2.5 py-1.5">
                        <dt className="text-[10px] uppercase tracking-wide text-gray-400"><T>{k}</T></dt>
                        <dd className="font-semibold text-gray-800">{v}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                <p className="mt-3 text-[11px] text-gray-400">{s.used} <T>hari dipakai di pola kerja</T></p>
                {canEdit && (
                  <>
                    {/* Garis pembatas sekaligus tombol buka / sembunyikan formulir ubah. */}
                    <button type="button" onClick={() => setShowForm((v) => !v)} aria-expanded={showForm}
                      className="group mt-4 flex w-full items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400 hover:text-brand">
                      <span className="h-px flex-1 bg-gray-200 group-hover:bg-brand/40" />
                      <T>{showForm ? "Sembunyikan pengaturan" : "Tampilkan pengaturan"}</T>
                      <ChevronDown size={14} className={`transition-transform ${showForm ? "rotate-180" : ""}`} />
                      <span className="h-px flex-1 bg-gray-200 group-hover:bg-brand/40" />
                    </button>
                    <div className={showForm ? "pt-4" : "hidden"}>
                      <ShiftForm key={`${s.id}:${JSON.stringify(s)}`} shift={s} onDirty={setDirty} onClose={() => {}} />
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })()}
      </div>
    </SectionCard>
  );
}

// ─── Pola kerja ─────────────────────────────────────────────────────────────

// Nama hari untuk hari ke-i siklus, dihitung dari tanggal mulai.
const weekdayOf = (startDate: string, i: number) => {
  const d = new Date(`${startDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + i);
  return WEEKDAYS[d.getUTCDay()];
};

function PatternDialog({ pattern, shifts, onClose }: { pattern: Pattern | "new"; shifts: Shift[]; onClose: () => void }) {
  const t = useT();
  const active = shifts.filter((s) => s.isActive);
  const fallback = active.find((s) => !s.isOff)?.id ?? active[0]?.id ?? "";
  const [form, setForm] = useState<PatternInput>(() =>
    pattern === "new"
      ? { name: "", description: "", cycleDays: 7, startDate: "2026-01-05", shiftIds: Array(7).fill(fallback) }
      : { ...pattern, description: pattern.description ?? "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function setCycle(n: number) {
    const cycle = Math.max(1, Math.min(62, Math.trunc(n) || 1));
    setForm((f) => ({
      ...f, cycleDays: cycle,
      shiftIds: Array.from({ length: cycle }, (_, i) => f.shiftIds[i] ?? f.shiftIds[i % Math.max(1, f.shiftIds.length)] ?? fallback),
    }));
  }

  function save() {
    setError(null);
    start(async () => {
      const r = await savePattern(pattern === "new" ? null : pattern.id, form);
      if (r.error) setError(r.error);
      else { if (r.proposed) showNotice(proposedText(r.proposed)); onClose(); }
    });
  }

  return (
    <Dialog open onOpenChange={(o: boolean) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle><T>{pattern === "new" ? "Tambah Pola Kerja" : "Ubah Pola Kerja"}</T></DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs"><T>Nama Pola</T></Label>
            <Input value={form.name} placeholder={t("Contoh: 5 Hari Kerja, Rotasi Gudang")} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs"><T>Keterangan</T></Label>
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs"><T>Panjang siklus (hari)</T></Label>
              <Input type="number" min={1} max={62} value={form.cycleDays} onChange={(e) => setCycle(Number(e.target.value))} />
              <p className="text-[11px] text-gray-400"><T>7 = mingguan, 14 = rotasi 2 minggu.</T></p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs"><T>Tanggal mulai siklus (hari ke-1)</T></Label>
              <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold text-gray-900"><T>Shift per hari</T></p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {form.shiftIds.map((id, i) => {
                const s = shifts.find((x) => x.id === id);
                return (
                  <label key={i} className="rounded-xl border border-gray-200 p-2.5" style={{ borderLeft: `4px solid ${s?.color ?? "#e5e7eb"}` }}>
                    <span className="block text-[11px] font-semibold text-gray-500">
                      <T>Hari</T> {i + 1} · <T>{weekdayOf(form.startDate, i)}</T>
                    </span>
                    <select value={id} onChange={(e) => setForm({ ...form, shiftIds: form.shiftIds.map((x, j) => (j === i ? e.target.value : x)) })}
                      className="mt-1 h-8 w-full rounded-lg border border-gray-200 bg-white px-1.5 text-sm">
                      {active.map((x) => <option key={x.id} value={x.id}>{x.code} · {x.name}</option>)}
                    </select>
                  </label>
                );
              })}
            </div>
          </div>
          <ErrorText text={error} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}><T>Batal</T></Button>
          <Button onClick={save} disabled={pending} className="gap-1.5">
            {pending && <Loader2 size={15} className="animate-spin" />} <T>Simpan</T>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PatternTab({ patterns, shifts, employees }: { patterns: Pattern[]; shifts: Shift[]; employees: EmployeeOption[] }) {
  const t = useT();
  const [editing, setEditing] = useState<Pattern | "new" | null>(null);
  const [assigning, setAssigning] = useState<Pattern | null>(null);
  const canEdit = useCanEdit(); // hak lihat saja: tanpa tambah/ubah/hapus pola
  const canApply = useCanApply(); // tempel pola ke karyawan cukup hak lihat
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const byId = new Map(shifts.map((s) => [s.id, s]));

  return (
    <SectionCard icon={Repeat} title="Pola Kerja" desc="Susunan shift yang berulang. Pola inilah yang nanti ditempel ke karyawan."
      action={canEdit && <PillButton onClick={() => setEditing("new")}><Plus size={14} /> <T>Tambah Pola</T></PillButton>}>
      <ErrorText text={error} />
      {patterns.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400"><T>Belum ada pola kerja.</T></p>
      ) : (
        <div className="space-y-3">
          {patterns.map((p) => {
            const hours = p.shiftIds.reduce((n, id) => n + effective(byId.get(id) ?? { isOff: true, startTime: null, endTime: null, breaks: [] }), 0);
            return (
              <div key={p.id} className="rounded-2xl border border-gray-100 bg-gray-50/70 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-bold text-gray-900">{p.name}</p>
                    <p className="text-xs text-gray-500">
                      {p.description ? `${p.description} · ` : ""}{p.cycleDays} <T>hari per siklus</T> · {fmtDur(hours)} <T>per siklus</T> · <T>mulai</T> {formatDate(new Date(`${p.startDate}T00:00:00Z`))}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="mr-1 rounded-full bg-white px-2.5 py-0.5 text-xs font-medium text-gray-500 ring-1 ring-gray-200">
                      {p.assigned} <T>karyawan</T>
                    </span>
                    {canApply && (
                    <button type="button" onClick={() => setAssigning(p)}
                      className="mr-1 inline-flex h-7 items-center rounded-full bg-ink px-3 text-[11px] font-semibold text-white hover:bg-ink/85">
                      <T>Tempel ke Karyawan</T>
                    </button>
                    )}
                    {canEdit && (<>
                    <button type="button" onClick={() => setEditing(p)} aria-label={t("Ubah")} className="rounded-full p-1.5 text-gray-400 hover:bg-white hover:text-brand">
                      <Pencil size={14} />
                    </button>
                    <button type="button" disabled={pending} aria-label={t("Hapus")}
                      onClick={async () => { if (await askConfirm(t("Hapus pola kerja ini?"))) start(async () => { setError(null); const r = await deletePattern(p.id); if (r.error) setError(r.error); else if (r.proposed) showNotice(proposedText(r.proposed)); }); }}
                      className="rounded-full p-1.5 text-gray-400 hover:bg-white hover:text-brand disabled:opacity-30">
                      <Trash2 size={14} />
                    </button>
                    </>)}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {p.shiftIds.map((id, i) => {
                    const s = byId.get(id);
                    return (
                      <div key={i} className="w-14 overflow-hidden rounded-lg border border-gray-200 bg-white text-center">
                        <p className="bg-gray-100 py-0.5 text-[10px] font-semibold text-gray-500"><T>{weekdayOf(p.startDate, i)}</T></p>
                        <p className="py-1 text-xs font-bold" style={{ color: s?.color }}>{s?.code ?? "?"}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {editing && <PatternDialog pattern={editing} shifts={shifts} onClose={() => setEditing(null)} />}
      {assigning && <AssignDialog pattern={assigning} employees={employees} onClose={() => setAssigning(null)} />}
    </SectionCard>
  );
}

// ─── Kalender libur ─────────────────────────────────────────────────────────

function HolidayTab({ holidays }: { holidays: Holiday[] }) {
  const t = useT();
  const [form, setForm] = useState({ date: "", name: "", type: "NASIONAL" });
  const [editId, setEditId] = useState<string | null>(null);
  // Ubah hari libur langsung di barisnya (form atas hanya untuk menambah).
  const [edit, setEdit] = useState({ date: "", name: "", type: "NASIONAL" });
  function saveEdit() {
    if (!editId) return;
    setError(null);
    start(async () => {
      const r = await saveHoliday(editId, edit);
      if (r.error) setError(r.error);
      else { if (r.proposed) showNotice(proposedText(r.proposed)); setEditId(null); }
    });
  }
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const years = [...new Set(holidays.map((h) => h.date.slice(0, 4)))].sort();
  const canEdit = useCanEdit(); // hak lihat saja: form tambah dan tombol ubah/hapus disembunyikan

  function save() {
    setError(null);
    start(async () => {
      const r = await saveHoliday(null, form);
      if (r.error) setError(r.error);
      else { if (r.proposed) showNotice(proposedText(r.proposed));  setForm({ date: "", name: "", type: "NASIONAL" }); }
    });
  }

  return (
    <SectionCard icon={CalendarOff} title="Kalender Libur" desc="Hari libur otomatis OFF; masuk kerja di hari libur dihitung lembur hari libur.">
      {canEdit && (
      <div className="grid gap-2 rounded-2xl border border-gray-100 bg-gray-50/70 p-3 sm:grid-cols-[170px_1fr_190px_auto]">
        <Input type="date" value={form.date} aria-label={t("Tanggal")} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        <Input value={form.name} placeholder={t("Nama hari libur")} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}
          className="h-8 rounded-lg border border-input bg-white px-2 text-sm">
          {Object.entries(HOLIDAY_TYPE).map(([k, v]) => <option key={k} value={k}>{t(v.label)}</option>)}
        </select>
        <div className="flex gap-2">
          <Button size="sm" onClick={save} disabled={pending || !form.date || !form.name.trim()} className="gap-1.5 rounded-full px-4">
            <Plus size={14} /> <T>Tambah</T>
          </Button>
        </div>
      </div>
      )}
      <div className="mt-3"><ErrorText text={error} /></div>

      {holidays.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-400"><T>Belum ada hari libur. Tambahkan libur nasional dan cuti bersama tahun ini.</T></p>
      ) : (
        <div className="mt-4 space-y-5">
          {years.map((y) => (
            <div key={y}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">{y}</p>
              <ul className="space-y-2">
                {holidays.filter((h) => h.date.startsWith(y)).map((h) => (
                  editId === h.id ? (
                  <li key={h.id} className="grid gap-2 rounded-xl border border-brand/40 bg-white px-3 py-2.5 sm:grid-cols-[170px_1fr_170px_auto]">
                    <Input type="date" value={edit.date} aria-label={t("Tanggal")} onChange={(e) => setEdit({ ...edit, date: e.target.value })} />
                    <Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
                    <select value={edit.type} onChange={(e) => setEdit({ ...edit, type: e.target.value })} className="h-8 rounded-lg border border-input bg-white px-2 text-sm">
                      {Object.entries(HOLIDAY_TYPE).map(([k, v]) => <option key={k} value={k}>{t(v.label)}</option>)}
                    </select>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={saveEdit} disabled={pending || !edit.date || !edit.name.trim()} className="rounded-full px-4"><T>Simpan</T></Button>
                      <Button size="sm" variant="outline" className="rounded-full" onClick={() => setEditId(null)}><T>Batal</T></Button>
                    </div>
                  </li>
                  ) : (
                  <li key={h.id} className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50/70 px-3 py-2.5">
                    <span className="w-28 shrink-0 text-sm font-semibold tabular-nums text-gray-900">
                      {formatDate(new Date(`${h.date}T00:00:00Z`))}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-gray-700">{h.name}</span>
                    <span className={`hidden shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium sm:inline ${HOLIDAY_TYPE[h.type]?.cls ?? ""}`}>
                      <T>{HOLIDAY_TYPE[h.type]?.label ?? h.type}</T>
                    </span>
                    {canEdit && (<>
                    <button type="button" onClick={() => { setEditId(h.id); setEdit({ date: h.date, name: h.name, type: h.type }); }}
                      aria-label={t("Ubah")} className="rounded-full p-1.5 text-gray-400 hover:bg-white hover:text-brand">
                      <Pencil size={14} />
                    </button>
                    <button type="button" disabled={pending} aria-label={t("Hapus")}
                      onClick={async () => { if (await askConfirm(t("Hapus hari libur ini?"))) start(async () => { const r = await deleteHoliday(h.id); if (r.error) toast(r.error, "error"); else if (r.proposed) showNotice(proposedText(r.proposed)); }); }}
                      className="rounded-full p-1.5 text-gray-400 hover:bg-white hover:text-brand disabled:opacity-30">
                      <Trash2 size={14} />
                    </button>
                    </>)}
                  </li>
                  )
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

// ─── Aturan kehadiran ───────────────────────────────────────────────────────

function RuleTab({ rule }: { rule: Rule }) {
  const [form, setForm] = useState<RuleInput>({
    overtimeNeedsApproval: rule.overtimeNeedsApproval, holidayWorkIsOvertime: rule.holidayWorkIsOvertime,
    halfDayMinutes: rule.halfDayMinutes, lateAsHalfDayMinutes: rule.lateAsHalfDayMinutes, noCheckInIsAlpha: rule.noCheckInIsAlpha,
    checkInOpenMinutes: rule.checkInOpenMinutes, checkInCloseMinutes: rule.checkInCloseMinutes, checkOutCloseMinutes: rule.checkOutCloseMinutes,
  });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const canEdit = useCanEdit(); // hak lihat saja: isian dikunci, tombol simpan disembunyikan

  function save() {
    setMsg(null);
    start(async () => {
      const r = await saveRule(form);
      if (r.proposed) showNotice(proposedText(r.proposed));
      setMsg(r.error ? { ok: false, text: r.error } : { ok: true, text: r.proposed ? proposedText(r.proposed) : "Aturan kehadiran tersimpan." });
    });
  }

  const statuses = [
    ["Tepat Waktu", "Masuk sebelum jam masuk + toleransi.", "bg-emerald-50 text-emerald-700"],
    ["Terlambat", "Masuk lewat dari jam masuk + toleransi terlambat.", "bg-amber-50 text-amber-700"],
    ["Pulang Cepat", "Pulang sebelum jam pulang − toleransi pulang cepat.", "bg-orange-50 text-orange-700"],
    ["Tidak Absen Pulang", "Absen masuk ada, absen pulang tidak ada.", "bg-violet-50 text-violet-700"],
    ["Alpha", "Hari kerja tanpa absen dan tanpa izin, cuti, sakit, atau dinas.", "bg-rose-50 text-rose-700"],
    ["Izin / Sakit / Cuti / Dinas", "Pengajuan yang disetujui menimpa status hari itu.", "bg-sky-50 text-sky-700"],
    ["Lembur", "Kerja melewati jam pulang sesuai aturan lembur shift, atau masuk di hari libur.", "bg-indigo-50 text-indigo-700"],
  ];

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <SectionCard icon={Scale} title="Aturan Kehadiran" desc="Berlaku untuk semua karyawan.">
        <div className="space-y-2.5">
          <Toggle disabled={!canEdit} checked={form.noCheckInIsAlpha} onChange={(v) => setForm({ ...form, noCheckInIsAlpha: v })}
            label="Tidak absen dihitung Alpha" hint="Hari kerja tanpa absen dan tanpa pengajuan yang disetujui." />
          <Toggle disabled={!canEdit} checked={form.overtimeNeedsApproval} onChange={(v) => setForm({ ...form, overtimeNeedsApproval: v })}
            label="Lembur harus disetujui atasan" hint="Kalau dimatikan, lembur dihitung otomatis dari jam absen." />
          <Toggle disabled={!canEdit} checked={form.holidayWorkIsOvertime} onChange={(v) => setForm({ ...form, holidayWorkIsOvertime: v })}
            label="Masuk di hari libur dihitung lembur" hint="Dicatat terpisah: lembur hari libur dan libur nasional." />
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          {canEdit && (
            <Button onClick={save} disabled={pending} className="gap-1.5 rounded-full px-5">
              {pending && <Loader2 size={15} className="animate-spin" />} <T>Simpan Aturan</T>
            </Button>
          )}
          {msg && <span className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-700"}`}><T>{msg.text}</T></span>}
          {rule.updatedBy && rule.updatedAt && (
            <span className="ml-auto text-xs text-gray-400">
              <T>Terakhir diubah</T> {rule.updatedBy} · {formatDateTime(rule.updatedAt)}
            </span>
          )}
        </div>
      </SectionCard>

      <SectionCard icon={CalendarClock} title="Status Kehadiran" desc="Dihitung otomatis dari absen dan jadwal.">
        <ul className="space-y-2">
          {statuses.map(([label, desc, cls]) => (
            <li key={label} className="rounded-xl border border-gray-100 p-3">
              <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}><T>{label}</T></span>
              <p className="mt-1 text-xs text-gray-500"><T>{desc}</T></p>
            </li>
          ))}
        </ul>
      </SectionCard>
    </div>
  );
}

// ─── Halaman ────────────────────────────────────────────────────────────────

export default function ScheduleClient({
  shifts, patterns, holidays, rule, locations, employees, initialTab, roster,
}: {
  shifts: Shift[]; patterns: Pattern[]; holidays: Holiday[]; rule: Rule;
  locations: Location[]; employees: EmployeeOption[];
  initialTab: Tab; roster: Awaited<ReturnType<typeof loadRoster>> | null;
}) {
  const router = useRouter();
  const [tab, setTabState] = useState<Tab>(initialTab);
  // Tab Jadwal Bulanan butuh data dari server, jadi dibuka lewat alamat (?tab=jadwal).
  const setTab = (k: Tab) => {
    setTabState(k);
    if (k === "jadwal" && !roster) router.push("?tab=jadwal", { scroll: false });
    else if (k !== "jadwal" && roster) router.replace("?", { scroll: false });
  };

  return (
    <div className="glossy-cards bg-gray-50 min-h-full">
      <div className="bg-white border-b border-gray-100 px-6 py-4">
        <h2 className="font-bold text-gray-800"><T>Jadwal</T></h2>
        <p className="text-xs text-gray-400 mt-0.5">
          <T>Tata kelola parameter jadwal kerja perusahaan sebagai dasar penilaian keterlambatan, pulang lebih awal, ketidakhadiran, dan lembur karyawan.</T>
        </p>
      </div>

      <main className="px-4 sm:px-6 py-5 max-w-6xl space-y-5">
        {/* Tab bergaya garis bawah langsung di atas latar portal (seperti Payroll & Benefit). */}
        <nav role="tablist" className="no-scrollbar flex gap-1 overflow-x-auto overflow-y-hidden border-b border-white/15">
          {TABS.map((x) => (
            <button key={x.key} role="tab" aria-selected={tab === x.key} onClick={() => setTab(x.key)}
              className={`relative inline-flex h-11 shrink-0 items-center gap-2 px-3 text-sm whitespace-nowrap transition-colors ${tab === x.key ? "font-semibold text-white" : "text-white/60 hover:text-white"}`}>
              <x.icon size={15} /> <T>{x.label}</T>
              {tab === x.key && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-white" />}
            </button>
          ))}
        </nav>

        {tab === "shift" && <ShiftTab shifts={shifts} />}
        {tab === "pola" && <PatternTab patterns={patterns} shifts={shifts} employees={employees} />}
        {tab === "libur" && <HolidayTab holidays={holidays} />}
        {tab === "lokasi" && (
          <LocationTab
            locations={locations}
            employees={employees}
            shifts={shifts.filter((s) => !s.isOff).map((s) => ({ id: s.id, label: `${s.code} · ${s.name}`, sub: `${s.startTime}–${s.endTime}`, color: s.color }))}
            patterns={patterns.map((p) => ({ id: p.id, label: p.name, sub: `${p.cycleDays} hari` }))}
          />
        )}
        {tab === "aturan" && <RuleTab rule={rule} />}
        {tab === "jadwal" && (roster ? (
          <RosterTab {...roster}
            shifts={shifts.filter((x) => x.isActive).map((x) => ({ id: x.id, code: x.code, name: x.name, color: x.color, isOff: x.isOff, startTime: x.startTime, endTime: x.endTime }))} />
        ) : (
          <div className="flex justify-center rounded-2xl border border-gray-200 bg-white py-14 text-gray-400"><Loader2 size={20} className="animate-spin" /></div>
        ))}
      </main>
    </div>
  );
}
