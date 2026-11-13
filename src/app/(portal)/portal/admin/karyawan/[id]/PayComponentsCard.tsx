"use client";

import { useState, useTransition } from "react";
import { Loader2, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { T, useT } from "@/components/i18n";
import { useCanEdit } from "@/components/portal/edit-access";
import { removePayAssignment, savePayAssignment } from "../actions";

export type PayComponentRow = {
  componentId: string; code: string; name: string; kind: string; method: string; formula: string;
  assigned: { startDate: string | null; endDate: string | null; note: string | null } | null;
};

const KINDS = [
  { key: "PENDAPATAN", label: "Pendapatan", color: "#10b981" },
  { key: "POTONGAN", label: "Potongan", color: "#f43f5e" },
  { key: "BENEFIT", label: "Benefit ditanggung perusahaan", color: "#6366f1" },
] as const;

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
const fmt = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

// Status tempelan pada hari ini.
function status(a: PayComponentRow["assigned"]) {
  if (!a) return { label: "Tidak dapat", tone: "bg-gray-100 text-gray-500", active: false };
  const t = today();
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
  const act = (fn: () => Promise<{ error?: string }>) => {
    setError(null);
    run(async () => {
      const r = await fn();
      if (r.error) setError(r.error);
      else onClose();
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
              onClick={() => { if (window.confirm(t("Lepas komponen ini dari karyawan? Riwayat masa berlakunya ikut terhapus. Untuk demosi, cukup isi tanggal Sampai."))) act(() => removePayAssignment(userId, row.componentId)); }}>
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
export default function PayComponentsCard({ userId, rows, joinDate = null }: { userId: string; rows: PayComponentRow[]; joinDate?: string | null }) {
  const t = useT();
  const canEdit = useCanEdit("gaji"); // hak lihat saja: komponen tidak bisa dibuka untuk diubah
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PayComponentRow | null>(null);
  // Tertempel lebih dulu, yang belum tertempel di bawah tiap kelompok.
  const visible = [...rows.filter((r) => r.assigned), ...rows.filter((r) => !r.assigned)];
  const notAssigned = rows.filter((r) => !r.assigned).length;
  const activeCount = rows.filter((r) => status(r.assigned).active).length;
  return (
    <section className="rounded-2xl border border-gray-200 bg-white">
      <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 px-5 py-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-gray-900"><T>Komponen Gaji</T> <span className="text-xs font-normal text-gray-400">{activeCount} <T>berlaku</T>{notAssigned > 0 && <> · {notAssigned} <T>belum ditempel</T></>}</span></h3>
          <p className="text-xs text-gray-400"><T>Komponen yang dihitung saat Proses Gaji. Untuk demosi/promosi, atur tanggal Sampai/Mulai; komponennya sendiri tidak diubah.</T></p>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-gray-600">
          <input type="checkbox" checked={open} onChange={(e) => setOpen(e.target.checked)} className="h-4 w-4 accent-[var(--color-brand)]" />
          <T>Tampilkan komponen</T>
        </label>
      </div>
      {open && <div className="grid gap-4 p-4 md:grid-cols-3">
        {KINDS.map((k) => {
          const list = visible.filter((r) => r.kind === k.key);
          return (
            <div key={k.key}>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: k.color }}><T>{k.label}</T></p>
              {list.length === 0 && <p className="text-xs text-gray-400">—</p>}
              <ul className="space-y-1.5">
                {list.map((r) => {
                  const st = status(r.assigned);
                  return (
                    <li key={r.componentId}>
                      <button type="button" onClick={() => setEditing(r)} disabled={!canEdit}
                        className={`group flex w-full items-start gap-2 rounded-xl border border-gray-100 px-2.5 py-2 text-left enabled:hover:border-gray-300 ${st.active ? "" : "opacity-70"}`}>
                        <span className="mt-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-bold text-white" style={{ background: st.active ? k.color : "#9ca3af" }}>{r.code}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm text-gray-900">{t(r.name)}</span>
                          <span className="block truncate text-[11px] text-gray-400" title={t(r.formula)}>{t(r.formula)}</span>
                          <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${st.tone}`}>{t(st.label)}</span>
                          {r.assigned?.note && <span className="ml-1.5 text-[10px] text-gray-500">{r.assigned.note}</span>}
                        </span>
                        {canEdit && <Settings2 size={13} className="mt-1 shrink-0 text-gray-300 group-hover:text-brand" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>}
      {editing && <AssignDialog key={editing.componentId} userId={userId} row={editing} joinDate={joinDate} onClose={() => setEditing(null)} />}
    </section>
  );
}
