"use client";

// Jadwal pembayaran THR / Bonus (Pengaturan payroll): tanggal bayar, ikut payroll bulanan / mingguan / terpisah.
// PPh 21 THR karyawan bulanan dihitung di proses gaji bulanan pada bulan THR dibayar.
import { useState, useTransition } from "react";
import { CalendarClock, CheckCircle2, Loader2, Plus, Trash2 } from "lucide-react";
import { T, useT } from "@/components/i18n";
import { useCanEdit } from "@/components/portal/edit-access";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { proposedText } from "@/lib/approval-text";
import type { BonusEntry, BonusMode } from "@/lib/payroll-bonus";
import { saveBonusSchedule } from "./actions";
import { showNotice } from "@/components/portal/Confirm";

const MODES: { key: BonusMode; label: string; hint: string }[] = [
  { key: "BULANAN", label: "Ikut payroll bulanan", hint: "Dibayar bersama gaji bulan yang memuat tanggal bayar (karyawan mingguan: minggu tanggal bayar)." },
  { key: "MINGGUAN", label: "Ikut payroll mingguan", hint: "Dibayar di payroll mingguan yang memuat tanggal bayar, termasuk karyawan bulanan." },
  { key: "TERPISAH", label: "Dibayar terpisah", hint: "Diproses tersendiri di Proses Gaji (pilihan \"THR / Bonus\") pada tanggal bayar." },
];
const field = "h-9 w-full rounded-lg border border-input bg-white px-2 text-sm";
const newId = () => Math.random().toString(36).slice(2, 10);

export default function BonusSchedule({ entries, components }: { entries: BonusEntry[]; components: { code: string; name: string }[] }) {
  const t = useT();
  const canEdit = useCanEdit();
  const [rows, setRows] = useState<BonusEntry[]>(entries);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const set = (id: string, patch: Partial<BonusEntry>) => { setMsg(null); setRows((r) => r.map((x) => (x.id === id ? { ...x, ...patch } : x))); };
  const add = () => { setMsg(null); setRows((r) => [...r, { id: newId(), code: components[0]?.code ?? "", label: "", payDate: "", mode: "BULANAN" }]); };
  const save = () => start(async () => {
    const r = await saveBonusSchedule(rows);
    if (r.proposed) showNotice(proposedText(r.proposed));
    setMsg(r.error ? { ok: false, text: r.error } : { ok: true, text: r.proposed ? proposedText(r.proposed) : "Jadwal THR / Bonus tersimpan." });
  });

  return (
    <section className="rounded-2xl border border-gray-200 bg-white">
      <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-400 text-white"><CalendarClock size={17} /></span>
        <div>
          <h3 className="font-semibold text-gray-900"><T>Jadwal THR / Bonus</T></h3>
          <p className="text-xs text-gray-400"><T>Tanggal bayar dan cara bayar THR / Bonus. PPh 21 THR karyawan bulanan dihitung di payroll bulanan pada bulan THR dibayar.</T></p>
        </div>
      </div>
      <div className="space-y-3 p-5">
        {components.length === 0 ? (
          <p className="text-sm text-gray-400"><T>Belum ada komponen dengan cara hitung THR / Bonus. Buat dulu di tab Komponen.</T></p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-gray-400"><T>Belum ada jadwal THR / Bonus.</T></p>
        ) : (
          <fieldset disabled={!canEdit} className="space-y-3">
            {rows.map((r) => (
              <div key={r.id} className="grid gap-3 rounded-xl border border-gray-100 bg-gray-50/60 p-3 md:grid-cols-[1fr_1.4fr_10rem_1.2fr_auto]">
                <div className="space-y-1"><p className="text-[11px] font-medium text-gray-500"><T>Komponen</T></p>
                  <select value={r.code} onChange={(e) => set(r.id, { code: e.target.value })} className={field}>
                    {components.map((c) => <option key={c.code} value={c.code}>{c.code} - {t(c.name)}</option>)}
                  </select></div>
                <div className="space-y-1"><p className="text-[11px] font-medium text-gray-500"><T>Keterangan</T></p>
                  <Input value={r.label} placeholder={t("mis. THR Idul Fitri 2027")} onChange={(e) => set(r.id, { label: e.target.value })} /></div>
                <div className="space-y-1"><p className="text-[11px] font-medium text-gray-500"><T>Tanggal bayar</T></p>
                  <input type="date" value={r.payDate} onChange={(e) => set(r.id, { payDate: e.target.value })} className={field} /></div>
                <div className="space-y-1"><p className="text-[11px] font-medium text-gray-500"><T>Dibayar</T></p>
                  <select value={r.mode} onChange={(e) => set(r.id, { mode: e.target.value as BonusMode })} className={field}>
                    {MODES.map((m) => <option key={m.key} value={m.key}>{t(m.label)}</option>)}
                  </select>
                  <p className="text-[11px] text-gray-400"><T>{MODES.find((m) => m.key === r.mode)?.hint ?? ""}</T></p></div>
                {canEdit && <button type="button" onClick={() => setRows((x) => x.filter((y) => y.id !== r.id))} aria-label={t("Hapus")}
                  className="mt-5 flex h-9 w-9 items-center justify-center self-start rounded-lg text-gray-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={15} /></button>}
              </div>
            ))}
          </fieldset>
        )}
        {canEdit && components.length > 0 && (
          <button type="button" onClick={add} className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50">
            <Plus size={13} /> <T>Tambah jadwal</T>
          </button>
        )}
      </div>
      {canEdit && components.length > 0 && <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-5 py-3">
        {msg && <span className={`flex items-center gap-1.5 text-sm ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>{msg.ok && <CheckCircle2 size={14} />}<T>{msg.text}</T></span>}
        <Button onClick={save} disabled={pending} className="gap-1.5">{pending && <Loader2 size={15} className="animate-spin" />} <T>Simpan Jadwal</T></Button>
      </div>}
    </section>
  );
}
