"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Trash2 } from "lucide-react";
import { T, useT } from "@/components/i18n";
import { deleteAttendanceBySuper, saveAttendanceBySuper } from "../attendance-actions";

const STATUSES = [["HADIR", "Hadir"], ["IZIN", "Izin"], ["SAKIT", "Sakit"], ["ALPHA", "Alpha"], ["CUTI", "Cuti"], ["DINAS", "Dinas"]] as const;
const hhmm = (d: Date | null | undefined) =>
  d ? new Date(d).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Jakarta" }) : "";

// Ubah / tambah absen satu tanggal, termasuk tanggal yang sudah lewat (khusus Super Admin, masa testing).
// Jam dalam WIB. Tanggal di periode gaji yang sudah final ditolak server.
export default function AttendanceEditor({ userId, date, current }: {
  userId: string; date: string;
  current?: { checkIn: Date | null; checkOut: Date | null; status: string; note: string | null };
}) {
  const t = useT();
  const router = useRouter();
  // Tanggal bertanda Alpha tanpa jam (mis. Alpha otomatis) dibuka dengan status Hadir supaya tinggal isi jam.
  const blank = () => ({
    checkIn: hhmm(current?.checkIn), checkOut: hhmm(current?.checkOut),
    status: !current || (current.status === "ALPHA" && !current.checkIn) ? "HADIR" : current.status, note: "",
  });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blank);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ error?: string }>) => start(async () => {
    setError("");
    const r = await fn();
    if (r.error) setError(r.error); else { setOpen(false); router.refresh(); }
  });
  const field = "h-8 w-full rounded-lg border border-gray-200 px-2 text-sm";

  if (!open) return (
    <button type="button" onClick={() => { setForm(blank()); setError(""); setOpen(true); }}
      className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">
      <Pencil size={12} /> <T>{current ? "Ubah absen" : "Tambah absen"}</T> <span className="text-[10px] text-gray-400">(Super Admin)</span>
    </button>
  );
  return (
    <div className="mt-3 space-y-2 rounded-xl border border-amber-200 bg-amber-50/50 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-800"><T>Ubah absen (Super Admin, masa testing)</T></p>
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1 text-xs text-gray-600"><span><T>Masuk</T></span>
          <input type="time" value={form.checkIn} onChange={(e) => setForm({ ...form, checkIn: e.target.value })} className={field} /></label>
        <label className="space-y-1 text-xs text-gray-600"><span><T>Pulang</T></span>
          <input type="time" value={form.checkOut} onChange={(e) => setForm({ ...form, checkOut: e.target.value })} className={field} /></label>
      </div>
      <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={field}>
        {STATUSES.map(([k, l]) => <option key={k} value={k}>{t(l)}</option>)}
      </select>
      <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder={t("Catatan (opsional)")} className={field} />
      <p className="text-[10px] text-gray-500"><T>Jam pulang lebih kecil dari jam masuk = pulang keesokan harinya.</T></p>
      {error && <p className="text-xs text-rose-600"><T>{error}</T></p>}
      <div className="flex items-center gap-2">
        {current && (
          <button type="button" disabled={pending} onClick={() => { if (window.confirm(t("Hapus absen tanggal ini?"))) run(() => deleteAttendanceBySuper(userId, date)); }}
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50"><Trash2 size={12} /> <T>Hapus</T></button>
        )}
        <button type="button" disabled={pending} onClick={() => setOpen(false)} className="ml-auto rounded-full px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100"><T>Batal</T></button>
        <button type="button" disabled={pending} onClick={() => run(() => saveAttendanceBySuper(userId, date, form))}
          className="inline-flex items-center gap-1 rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
          {pending && <Loader2 size={12} className="animate-spin" />} <T>Simpan</T>
        </button>
      </div>
    </div>
  );
}
