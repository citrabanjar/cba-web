"use client";

import { useState, useTransition } from "react";
import { ClipboardList, CheckCircle2, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { T, useT } from "@/components/i18n";
import { MONITOR_CHECKS, type AgentSettings as Settings, type SopReminder } from "@/lib/agent-hrd";
import { deleteReminder, saveAgentRules, saveReminder } from "./agent-actions";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const EMPTY: SopReminder = { id: "", title: "", note: "", freq: "MONTHLY", day: 25, month: 1, date: "", leadDays: 3 };
const select = "h-9 w-full rounded-lg border border-input bg-white px-2 text-sm";
const describe = (r: SopReminder) =>
  r.freq === "MONTHLY" ? `Setiap tanggal ${r.day}` : r.freq === "YEARLY" ? `Setiap ${r.day} ${MONTHS[(r.month || 1) - 1]}` : `Sekali, ${r.date}`;

// Pengaturan Task Admin (Admin): pengecekan yang aktif, batas angka, dan pengingat SOP.
export default function AgentSettings({ settings }: { settings: Settings }) {
  const t = useT();
  const [enabled, setEnabled] = useState<string[]>(settings.enabled);
  const [contractDays, setContractDays] = useState(String(settings.contractDays));
  const [remindDays, setRemindDays] = useState(String(settings.payrollRemindDays));
  const [editing, setEditing] = useState<SopReminder | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const groups = [...new Set(MONITOR_CHECKS.map((c) => c.group))];

  const run = (fn: () => Promise<{ error?: string }>, ok: string, after?: () => void) => {
    setMsg(null);
    start(async () => {
      const r = await fn();
      if (r.error) setMsg({ ok: false, text: r.error });
      else { setMsg({ ok: true, text: ok }); after?.(); }
    });
  };

  return (
    <Card className="border-gray-100">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gray-600"><ClipboardList size={15} /> <T>Task Admin</T></CardTitle>
        <p className="text-xs text-gray-400"><T>Atur pengecekan yang dipantau Task Admin di Beranda, batas angkanya, dan pengingat SOP perusahaan.</T></p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-3">
          <p className="text-xs font-semibold text-gray-600"><T>Pengecekan yang dipantau</T></p>
          <div className="grid gap-3 sm:grid-cols-2">
            {groups.map((g) => (
              <div key={g} className="rounded-xl border border-gray-100 p-3">
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400"><T>{g}</T></p>
                {MONITOR_CHECKS.filter((c) => c.group === g).map((c) => (
                  <label key={c.key} className="flex cursor-pointer items-center gap-2 py-0.5 text-sm text-gray-700">
                    <input type="checkbox" checked={enabled.includes(c.key)} className="h-4 w-4 accent-[var(--color-brand)]"
                      onChange={(e) => setEnabled((d) => (e.target.checked ? [...d, c.key] : d.filter((k) => k !== c.key)))} />
                    <T>{c.title}</T>
                  </label>
                ))}
              </div>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label className="text-xs"><T>Kontrak berakhir diingatkan (hari sebelumnya)</T></Label>
              <Input type="number" min={1} max={365} value={contractDays} onChange={(e) => setContractDays(e.target.value)} /></div>
            <div className="space-y-1.5"><Label className="text-xs"><T>Proses Gaji diingatkan (hari sebelum gajian)</T></Label>
              <Input type="number" min={0} max={31} value={remindDays} onChange={(e) => setRemindDays(e.target.value)} /></div>
          </div>
          <div className="flex justify-end">
            <Button size="sm" disabled={pending} className="gap-1.5"
              onClick={() => run(() => saveAgentRules({ enabled, contractDays: Number(contractDays), payrollRemindDays: Number(remindDays) }), "Pengaturan Task Admin tersimpan.")}>
              {pending && <Loader2 size={14} className="animate-spin" />} <T>Simpan Pengecekan</T>
            </Button>
          </div>
        </div>

        <div className="space-y-2 border-t border-gray-100 pt-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-600"><T>Pengingat SOP</T></p>
              <p className="text-[11px] text-gray-400"><T>Tugas berulang perusahaan yang dimunculkan Task Admin pada tanggalnya sampai ditandai selesai.</T></p>
            </div>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setEditing({ ...EMPTY })}><Plus size={14} /> <T>Tambah</T></Button>
          </div>
          {settings.reminders.length === 0 && !editing && <p className="rounded-lg bg-gray-50 px-3 py-3 text-center text-xs text-gray-400"><T>Belum ada pengingat SOP.</T></p>}
          <ul className="space-y-1.5">
            {settings.reminders.map((r) => (
              <li key={r.id} className="flex items-start gap-2 rounded-xl border border-gray-100 px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-gray-900">{r.title}</span>
                  <span className="block text-[11px] text-gray-500"><T>{describe(r)}</T> · <T>muncul</T> {r.leadDays} <T>hari sebelumnya</T></span>
                  {r.note && <span className="block text-[11px] text-gray-400">{r.note}</span>}
                </span>
                <button type="button" aria-label={t("Ubah")} className="rounded p-1 text-gray-400 hover:text-brand" onClick={() => setEditing({ ...r })}><Pencil size={14} /></button>
                <button type="button" aria-label={t("Hapus")} className="rounded p-1 text-gray-400 hover:text-rose-600"
                  onClick={() => { if (window.confirm(t("Hapus pengingat ini?"))) run(() => deleteReminder(r.id), "Pengingat dihapus."); }}><Trash2 size={14} /></button>
              </li>
            ))}
          </ul>
          {editing && (
            <div className="space-y-3 rounded-xl bg-gray-50 p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2"><Label className="text-xs"><T>Judul</T></Label>
                  <Input value={editing.title} placeholder={t("mis. Rekap uang makan lembur")} onChange={(e) => setEditing({ ...editing, title: e.target.value })} /></div>
                <div className="space-y-1.5"><Label className="text-xs"><T>Ulangi</T></Label>
                  <select value={editing.freq} onChange={(e) => setEditing({ ...editing, freq: e.target.value as SopReminder["freq"] })} className={select}>
                    <option value="MONTHLY">{t("Setiap bulan")}</option><option value="YEARLY">{t("Setiap tahun")}</option><option value="ONCE">{t("Sekali")}</option>
                  </select></div>
                {editing.freq === "ONCE" ? (
                  <div className="space-y-1.5"><Label className="text-xs"><T>Tanggal</T></Label>
                    <Input type="date" value={editing.date} onChange={(e) => setEditing({ ...editing, date: e.target.value })} /></div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5"><Label className="text-xs"><T>Tanggal</T></Label>
                      <Input type="number" min={1} max={31} value={editing.day} onChange={(e) => setEditing({ ...editing, day: Number(e.target.value) })} /></div>
                    {editing.freq === "YEARLY" && (
                      <div className="space-y-1.5"><Label className="text-xs"><T>Bulan</T></Label>
                        <select value={editing.month} onChange={(e) => setEditing({ ...editing, month: Number(e.target.value) })} className={select}>
                          {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                        </select></div>
                    )}
                  </div>
                )}
                <div className="space-y-1.5"><Label className="text-xs"><T>Muncul berapa hari sebelumnya</T></Label>
                  <Input type="number" min={0} max={60} value={editing.leadDays} onChange={(e) => setEditing({ ...editing, leadDays: Number(e.target.value) })} /></div>
                <div className="space-y-1.5 sm:col-span-2"><Label className="text-xs"><T>Catatan / langkah SOP</T></Label>
                  <Input value={editing.note} onChange={(e) => setEditing({ ...editing, note: e.target.value })} /></div>
              </div>
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditing(null)}><T>Batal</T></Button>
                <Button size="sm" disabled={pending} className="gap-1.5" onClick={() => run(() => saveReminder(editing), "Pengingat tersimpan.", () => setEditing(null))}>
                  {pending && <Loader2 size={14} className="animate-spin" />} <T>Simpan Pengingat</T>
                </Button>
              </div>
            </div>
          )}
        </div>

        {msg && <p className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{msg.ok && <CheckCircle2 size={14} />}<T>{msg.text}</T></p>}
      </CardContent>
    </Card>
  );
}
