"use client";

import { useState, useTransition } from "react";
import { BookOpen, Bot, Check, CheckCircle2, Loader2, Pencil, Play, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { T, useT } from "@/components/i18n";
import { useCanEdit } from "@/components/portal/edit-access";
import { AI_INTERVALS, AI_MODEL_LABEL, USD_TO_IDR, estimateCostUsd, type AiSettings as Settings } from "@/lib/ai-checker-settings";
import { collectAiNow, decideAiRule, deleteAiNote, runAiNow, saveAiNote, saveAiSettings } from "./ai-actions";

export type AiNoteView = { id: string; kind: string; title: string; content: string; status: string; source: string; createdBy: string | null; approvedBy: string | null; createdAt: string };
export type AiRunView = {
  id: string; status: string; trigger: string; createdAt: string; finishedAt: string | null; findingCount: number;
  inputTokens: number; outputTokens: number; cacheReadTokens: number; summary: string | null; error: string | null;
};

const select = "h-9 w-full rounded-lg border border-input bg-white px-2 text-sm";
const when = (d: string) => new Date(d).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
const rupiah = (usd: number) => `± Rp${Math.round(usd * USD_TO_IDR).toLocaleString("id-ID")}`;
const RUN_TONE: Record<string, string> = { MENUNGGU: "bg-amber-100 text-amber-700", SELESAI: "bg-emerald-100 text-emerald-700", GAGAL: "bg-rose-100 text-rose-700" };
const RUN_LABEL: Record<string, string> = { MENUNGGU: "Diproses AI", SELESAI: "Selesai", GAGAL: "Gagal" };

// Pengaturan Agent HRD / AI pemeriksa (Admin): jadwal, data yang dikirim, buku SOP, usulan aturan dari AI, dan riwayat.
export default function AiSettings({ settings, hasKey, hasCron, notes, runs }: {
  settings: Settings; hasKey: boolean; hasCron: boolean; notes: AiNoteView[]; runs: AiRunView[];
}) {
  const t = useT();
  const canEdit = useCanEdit(); // hak lihat saja: isian terkunci, tombol simpan/jalankan/setujui/hapus disembunyikan
  const [form, setForm] = useState(settings);
  const [editing, setEditing] = useState<{ id?: string; title: string; content: string } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const waiting = runs.some((r) => r.status === "MENUNGGU");
  const sops = notes.filter((n) => n.kind === "SOP");
  const proposals = notes.filter((n) => n.kind === "ATURAN" && n.status === "USULAN");
  const rules = notes.filter((n) => n.kind === "ATURAN" && n.status === "AKTIF");
  const dismissed = notes.filter((n) => n.kind === "BUKAN_MASALAH");
  const [now] = useState(() => Date.now());
  const monthCost = runs.filter((r) => now - new Date(r.createdAt).getTime() < 30 * 86_400_000).reduce((a, r) => a + estimateCostUsd(r), 0);

  const act = (fn: () => Promise<{ error?: string; info?: string }>, ok?: string, after?: () => void) => {
    setMsg(null);
    start(async () => {
      const r = await fn();
      if (r.error) setMsg({ ok: false, text: r.error });
      else { setMsg({ ok: true, text: r.info ?? ok ?? "" }); after?.(); }
    });
  };
  const notice = msg && (
    <p className={`rounded-lg px-3 py-2 text-xs ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}><T>{msg.text}</T></p>
  );

  return (
    <div className="space-y-5">
      <Card className="border-gray-100">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gray-600"><Bot size={15} /> <T>Agent HRD</T></CardTitle>
          <p className="text-xs text-gray-400">
            <T>AI membaca ringkasan data portal secara berkala dan menulis temuan ke Task Admin berlabel AI. Nama, No. KTP, rekening, dan alamat tidak dikirim; karyawan disebut dengan Employee ID.</T>
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {(!hasKey || !hasCron) && (
            <div className="space-y-1 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {!hasKey && <p><T>ANTHROPIC_API_KEY belum diisi di Vercel. AI belum bisa dijalankan.</T></p>}
              {!hasCron && <p><T>CRON_SECRET belum diisi di Vercel. Pemeriksaan terjadwal belum bisa berjalan; tombol Jalankan sekarang tetap bisa dipakai.</T></p>}
            </div>
          )}
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-gray-800">
            <input type="checkbox" checked={form.enabled} disabled={!canEdit} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} className="h-4 w-4 accent-[var(--color-brand)]" />
            <T>Aktifkan pemeriksaan terjadwal</T>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label className="text-xs"><T>Jadwal pemeriksaan</T></Label>
              <select className={select} value={form.intervalDays} disabled={!canEdit} onChange={(e) => setForm({ ...form, intervalDays: Number(e.target.value) })}>
                {AI_INTERVALS.map((i) => <option key={i.days} value={i.days}>{t(i.label)}</option>)}
              </select>
              <p className="text-[11px] text-gray-400"><T>Berjalan dini hari (± 01.00 WIB), hasil siap sebelum jam kerja.</T></p>
            </div>
            <div className="space-y-1.5"><Label className="text-xs"><T>Model AI</T></Label>
              <p className="flex h-9 items-center rounded-lg bg-gray-50 px-3 text-sm text-gray-700">{AI_MODEL_LABEL}</p>
              <p className="text-[11px] text-gray-400"><T>Biaya 30 hari terakhir</T>: <b>{rupiah(monthCost)}</b> (${monthCost.toFixed(2)})</p>
            </div>
          </div>
          <label className="flex cursor-pointer items-start gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={form.includeSalary} disabled={!canEdit} onChange={(e) => setForm({ ...form, includeSalary: e.target.checked })} className="mt-0.5 h-4 w-4 accent-[var(--color-brand)]" />
            <span><T>Sertakan angka gaji</T> <span className="block text-[11px] text-gray-400"><T>Gaji pokok, komponen, potongan, dan gaji bersih per periode ikut dibaca AI. Kalau dimatikan, AI hanya melihat persentase perubahan.</T></span></span>
          </label>
          {notice}
          {canEdit && <div className="flex flex-wrap justify-end gap-2">
            <Button size="sm" variant="outline" disabled={pending || !waiting} className="gap-1.5" onClick={() => act(collectAiNow)}><RefreshCw size={14} /> <T>Ambil hasil</T></Button>
            <Button size="sm" variant="outline" disabled={pending || waiting || !hasKey} className="gap-1.5"
              onClick={() => { if (window.confirm(t("Jalankan pemeriksaan AI sekarang? Biaya dihitung per pemeriksaan."))) act(runAiNow); }}>
              <Play size={14} /> <T>Jalankan sekarang</T>
            </Button>
            <Button size="sm" disabled={pending} className="gap-1.5" onClick={() => act(() => saveAiSettings(form), "Pengaturan AI tersimpan.")}>
              {pending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} <T>Simpan</T>
            </Button>
          </div>}
        </CardContent>
      </Card>

      <Card className="border-gray-100">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gray-600"><BookOpen size={15} /> <T>Buku SOP untuk AI</T></CardTitle>
          <p className="text-xs text-gray-400"><T>Tulis atau tempel SOP perusahaan per topik. AI membaca semuanya setiap kali memeriksa dan memakainya sebagai acuan.</T></p>
        </CardHeader>
        <CardContent className="space-y-3">
          {sops.length === 0 && !editing && <p className="rounded-lg border border-dashed border-gray-200 p-4 text-center text-xs text-gray-400"><T>Belum ada SOP.</T></p>}
          {sops.map((n) => (
            <div key={n.id} className="rounded-xl border border-gray-100 p-3">
              <div className="flex items-start gap-2">
                <p className="flex-1 text-sm font-semibold text-gray-900">{n.title}</p>
                {canEdit && <>
                  <button type="button" aria-label={t("Ubah")} className="rounded p-1 text-gray-400 hover:text-gray-700" onClick={() => setEditing({ id: n.id, title: n.title, content: n.content })}><Pencil size={14} /></button>
                  <button type="button" aria-label={t("Hapus")} className="rounded p-1 text-gray-400 hover:text-rose-600"
                    onClick={() => { if (window.confirm(t("Hapus SOP ini?"))) act(() => deleteAiNote(n.id), "SOP dihapus."); }}><Trash2 size={14} /></button>
                </>}
              </div>
              <p className="mt-1 line-clamp-3 whitespace-pre-line text-xs text-gray-500">{n.content}</p>
            </div>
          ))}
          {!canEdit ? null : editing ? (
            <div className="space-y-2 rounded-xl border border-gray-200 p-3">
              <Input placeholder={t("Judul, mis. SOP Lembur")} value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
              <textarea rows={8} placeholder={t("Isi SOP")} value={editing.content} onChange={(e) => setEditing({ ...editing, content: e.target.value })}
                className="w-full rounded-lg border border-input px-3 py-2 text-sm" />
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditing(null)}><T>Batal</T></Button>
                <Button size="sm" disabled={pending} onClick={() => act(() => saveAiNote(editing), "SOP tersimpan.", () => setEditing(null))}><T>Simpan SOP</T></Button>
              </div>
            </div>
          ) : (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setEditing({ title: "", content: "" })}><Plus size={14} /> <T>Tambah SOP</T></Button>
          )}
        </CardContent>
      </Card>

      <Card className="border-gray-100">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold uppercase tracking-wide text-gray-600"><T>Catatan belajar AI</T></CardTitle>
          <p className="text-xs text-gray-400"><T>Usulan aturan dari AI menunggu persetujuan Admin. Aturan yang disetujui dan catatan Bukan masalah dari admin ikut dibaca AI mulai pemeriksaan berikutnya.</T></p>
        </CardHeader>
        <CardContent className="space-y-4">
          <NoteList title="Usulan aturan dari AI" empty="Belum ada usulan." list={proposals} actions={(n) => canEdit && (
            <>
              <button type="button" disabled={pending} className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100"
                onClick={() => act(() => decideAiRule(n.id, true), "Aturan disetujui.")}><Check size={12} /> <T>Setujui</T></button>
              <button type="button" disabled={pending} className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-semibold text-gray-600 hover:bg-gray-200"
                onClick={() => act(() => decideAiRule(n.id, false), "Usulan ditolak.")}><X size={12} /> <T>Tolak</T></button>
            </>
          )} />
          <NoteList title="Aturan aktif" empty="Belum ada aturan tambahan." list={rules} actions={(n) => canEdit && (
            <button type="button" aria-label={t("Hapus")} className="rounded p-1 text-gray-400 hover:text-rose-600"
              onClick={() => { if (window.confirm(t("Hapus aturan ini?"))) act(() => deleteAiNote(n.id), "Aturan dihapus."); }}><Trash2 size={14} /></button>
          )} />
          <NoteList title="Catatan Bukan masalah" empty="Belum ada catatan." list={dismissed} actions={(n) => canEdit && (
            <button type="button" aria-label={t("Hapus")} className="rounded p-1 text-gray-400 hover:text-rose-600"
              onClick={() => { if (window.confirm(t("Hapus catatan ini? AI boleh melaporkan hal ini lagi."))) act(() => deleteAiNote(n.id), "Catatan dihapus."); }}><Trash2 size={14} /></button>
          )} />
        </CardContent>
      </Card>

      <Card className="border-gray-100">
        <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold uppercase tracking-wide text-gray-600"><T>Riwayat pemeriksaan</T></CardTitle></CardHeader>
        <CardContent>
          {runs.length === 0 ? <p className="text-xs text-gray-400"><T>Belum pernah dijalankan.</T></p> : (
            <div className="divide-y divide-gray-100">
              {runs.map((r) => (
                <div key={r.id} className="py-2 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-gray-800">{when(r.createdAt)}</span>
                    <span className="text-gray-400"><T>{r.trigger === "MANUAL" ? "Manual" : "Terjadwal"}</T></span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${RUN_TONE[r.status] ?? "bg-gray-100 text-gray-600"}`}><T>{RUN_LABEL[r.status] ?? r.status}</T></span>
                    {r.status === "SELESAI" && <span className="text-gray-500">{r.findingCount} <T>temuan</T></span>}
                    {(r.inputTokens > 0 || r.outputTokens > 0) && <span className="ml-auto text-gray-400">{rupiah(estimateCostUsd(r))}</span>}
                  </div>
                  {r.summary && <p className="mt-0.5 text-gray-500">{r.summary}</p>}
                  {r.error && <p className="mt-0.5 text-rose-600">{r.error}</p>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function NoteList({ title, empty, list, actions }: { title: string; empty: string; list: AiNoteView[]; actions: (n: AiNoteView) => React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold text-gray-600"><T>{title}</T> <span className="font-normal text-gray-400">{list.length}</span></p>
      {list.length === 0 ? <p className="text-[11px] text-gray-400"><T>{empty}</T></p> : list.map((n) => (
        <div key={n.id} className="flex items-start gap-2 rounded-lg bg-gray-50 px-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-gray-800">{n.title}</p>
            <p className="whitespace-pre-line text-xs text-gray-500">{n.content}</p>
            {(n.createdBy || n.approvedBy) && <p className="mt-0.5 text-[10px] text-gray-400">{[n.createdBy, n.approvedBy && `disetujui ${n.approvedBy}`].filter(Boolean).join(" · ")}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-1">{actions(n)}</div>
        </div>
      ))}
    </div>
  );
}
