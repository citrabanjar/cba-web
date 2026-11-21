"use client";

import { useState, useTransition } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { T, useT } from "@/components/i18n";
import { useCanEdit } from "@/components/portal/edit-access";
import { removePayAssignment, savePayAssignment } from "../actions";
import { proposedText } from "@/lib/approval-text";
import { askConfirm, showNotice } from "@/components/portal/Confirm";

export type PayComponentRow = {
  componentId: string; code: string; name: string; kind: string; method: string; formula: string;
  assigned: { startDate: string | null; endDate: string | null; note: string | null } | null;
};

const KINDS = [
  { key: "PENDAPATAN", short: "Pendapatan" },
  { key: "POTONGAN", short: "Potongan" },
  { key: "BENEFIT", short: "Benefit" },
] as const;

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
const fmt = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

// Status tempelan pada hari ini.
// Tanpa tanggal Mulai = sejak tanggal masuk; karyawan yang belum masuk belum mendapat komponen.
function status(a: PayComponentRow["assigned"], joinDate: string | null = null) {
  if (!a) return { label: "Tidak dapat", tone: "bg-gray-100 text-gray-500", active: false };
  const t = today();
  if (!a.startDate && joinDate && joinDate > t) return { label: `Mulai ${fmt(joinDate)}`, tone: "bg-sky-50 text-sky-700", active: false };
  if (a.endDate && a.endDate < t) return { label: `Berakhir ${fmt(a.endDate)}`, tone: "bg-gray-100 text-gray-500", active: false };
  if (a.startDate && a.startDate > t) return { label: `Mulai ${fmt(a.startDate)}`, tone: "bg-sky-50 text-sky-700", active: false };
  return { label: a.endDate ? `Berlaku s/d ${fmt(a.endDate)}` : "Berlaku", tone: "bg-emerald-50 text-emerald-700", active: true };
}

function AssignDialog({ userId, row, joinDate, onClose }: { userId: string; row: PayComponentRow; joinDate: string | null; onClose: () => void }) {
  const t = useT();
  const [start, setStart] = useState(row.assigned?.startDate ?? "");
  const [end, setEnd] = useState(row.assigned?.endDate ?? "");
  const [note, setNote] = useState(row.assigned?.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, run] = useTransition();
  const act = (fn: () => Promise<{ error?: string; proposed?: string }>) => {
    setError(null);
    run(async () => {
      const r = await fn();
      if (r.error) setError(r.error);
      else { if (r.proposed) showNotice(proposedText(r.proposed)); onClose(); }
    });
  };
  return (
    <Dialog open onOpenChange={(o: boolean) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{row.code} · {t(row.name)}</DialogTitle></DialogHeader>
        <p className="-mt-2 text-xs text-gray-500">{t(row.formula)}</p>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label className="text-xs"><T>Mulai</T></Label>
              {/* Tidak boleh sebelum tanggal masuk karyawan. */}
              <Input type="date" value={start} min={joinDate ?? undefined} onChange={(e) => setStart(e.target.value)} />
              <p className="text-[11px] text-gray-400">{joinDate ? <><T>Kosong = sejak tanggal masuk</T> ({fmt(joinDate)})</> : <T>Kosong = sejak awal</T>}</p></div>
            <div className="space-y-1.5"><Label className="text-xs"><T>Sampai</T></Label>
              <Input type="date" value={end} min={start || joinDate || undefined} onChange={(e) => setEnd(e.target.value)} />
              <p className="text-[11px] text-gray-400"><T>Kosong = masih berlaku</T></p></div>
          </div>
          <div className="space-y-1.5"><Label className="text-xs"><T>Keterangan</T></Label>
            <Input value={note} placeholder={t("mis. Demosi, SK No. ...")} onChange={(e) => setNote(e.target.value)} /></div>
          <p className="rounded-lg bg-gray-50 px-3 py-2 text-[11px] text-gray-500">
            <T>Bila berakhir di tengah periode, komponen tetap dihitung prorata sampai tanggal berakhir; data hadir, dinas, dan cuti hanya dihitung di dalam masa berlaku.</T>
          </p>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"><T>{error}</T></p>}
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          {row.assigned ? (
            <Button variant="outline" disabled={pending} className="text-rose-600"
              onClick={async () => { if (await askConfirm(t("Lepas komponen ini dari karyawan? Riwayat masa berlakunya ikut terhapus. Untuk demosi, cukup isi tanggal Sampai."))) act(() => removePayAssignment(userId, row.componentId)); }}>
              <T>Lepas</T>
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}><T>Batal</T></Button>
            <Button disabled={pending} className="gap-1.5" onClick={() => act(() => savePayAssignment(userId, row.componentId, { startDate: start || null, endDate: end || null, note }))}>
              {pending && <Loader2 size={15} className="animate-spin" />} <T>{row.assigned ? "Simpan" : "Tempel"}</T>
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Komponen gaji yang tertempel ke karyawan ini beserta masa berlakunya.
// embedded: tampil di dalam bagian profil gaya CV yang sudah berjudul, jadi judul sendiri tidak diulang.
export default function PayComponentsCard({ userId, rows, joinDate = null }: { userId: string; rows: PayComponentRow[]; joinDate?: string | null; embedded?: boolean }) {
  const t = useT();
  const canEdit = useCanEdit("gaji"); // hak lihat saja: komponen tidak bisa dibuka untuk diubah
  const [editing, setEditing] = useState<PayComponentRow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [, run] = useTransition();
  // Tambah / hapus langsung dari kartu (permintaan pemilik 2026-11-21). Tanggal Mulai/Sampai tetap bisa diatur lewat klik kartu.
  const finish = (r: { error?: string; proposed?: string }) => {
    if (r.error) void showNotice(t(r.error), "error");
    else if (r.proposed) void showNotice(proposedText(r.proposed));
  };
  const add = (row: PayComponentRow) => {
    setBusy(row.componentId);
    run(async () => { finish(await savePayAssignment(userId, row.componentId, { startDate: null, endDate: null, note: "" })); setBusy(null); });
  };
  // Konfirmasi di luar transisi supaya dialognya tampil.
  const remove = async (row: PayComponentRow) => {
    if (!(await askConfirm(`${t("Hapus komponen")} ${row.code} · ${t(row.name)} ${t("dari karyawan ini?")}`))) return;
    setBusy(row.componentId);
    run(async () => { finish(await removePayAssignment(userId, row.componentId)); setBusy(null); });
  };
  const [adding, setAdding] = useState<string | null>(null); // jenis yang sedang dibuka daftar tambahnya
  // Gaya CV (permintaan pemilik 2026-11-21): "Pendapatan : Gaji Pokok / Tunjangan Jabatan", dst.
  // Hanya komponen yang dimiliki karyawan yang tampil; + menambah dari daftar komponen jenis itu, ikon sampah menghapus.
  // Klik nama komponen untuk mengatur tanggal Mulai/Sampai (demosi/promosi).
  return (
    <div className="space-y-3">
      {KINDS.map((k) => {
        const mine = rows.filter((r) => r.kind === k.key && r.assigned);
        const free = rows.filter((r) => r.kind === k.key && !r.assigned);
        return (
          <div key={k.key} className="grid grid-cols-[minmax(0,7.5rem)_auto_minmax(0,1fr)] gap-x-2 text-sm sm:grid-cols-[13rem_auto_minmax(0,1fr)]">
            <span className="text-gray-500"><T>{k.short}</T></span>
            <span aria-hidden className="text-gray-400">:</span>
            <div className="min-w-0 space-y-1">
              {mine.length === 0 && <p className="text-gray-400">—</p>}
              {mine.map((r) => {
                const st = status(r.assigned, joinDate);
                return (
                  <div key={r.componentId} className="flex min-w-0 items-center gap-2">
                    {/* Satu baris per komponen, tanpa keterangan rumus (permintaan pemilik). */}
                    <button type="button" onClick={() => setEditing(r)} disabled={!canEdit}
                      className="min-w-0 truncate text-left font-medium text-gray-900 enabled:hover:text-brand">{t(r.name)}</button>
                    {st.label !== "Berlaku" && <span className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold ${st.tone}`}>{t(st.label)}</span>}
                    {/* Gaji Pokok selalu melekat di karyawan, jadi tidak bisa dihapus. */}
                    {canEdit && r.code !== "GP" && (
                      <button type="button" disabled={busy === r.componentId} onClick={() => remove(r)} aria-label={t("Hapus")} title={t("Hapus dari karyawan")}
                        className="shrink-0 rounded-full p-1 text-gray-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50">
                        {busy === r.componentId ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                      </button>
                    )}
                  </div>
                );
              })}
              {canEdit && free.length > 0 && (adding === k.key ? (
                <select autoFocus defaultValue="" onBlur={() => setAdding(null)}
                  onChange={(e) => { const row = free.find((r) => r.componentId === e.target.value); setAdding(null); if (row) add(row); }}
                  className="h-8 max-w-full rounded-lg border border-gray-300 bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/40">
                  <option value="" disabled>{t("Pilih komponen...")}</option>
                  {free.map((r) => <option key={r.componentId} value={r.componentId}>{t(r.name)}</option>)}
                </select>
              ) : (
                <button type="button" onClick={() => setAdding(k.key)} disabled={!!busy} aria-label={`${t("Tambah")} ${t(k.short)}`}
                  className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-semibold text-brand hover:bg-brand/5 disabled:opacity-50">
                  {busy && free.some((r) => r.componentId === busy) ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} <T>Tambah</T>
                </button>
              ))}
            </div>
          </div>
        );
      })}
      {editing && <AssignDialog key={editing.componentId} userId={userId} row={editing} joinDate={joinDate} onClose={() => setEditing(null)} />}
    </div>
  );
}
