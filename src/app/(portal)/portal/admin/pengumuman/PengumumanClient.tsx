"use client";

import { useState, useTransition } from "react";
import { ChevronRight, Loader2, Megaphone, Pin, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { T, useT } from "@/components/i18n";
import { useCanEdit } from "@/components/portal/edit-access";
import { askConfirm, showNotice } from "@/components/portal/Confirm";
import { formatDate } from "@/lib/utils";
import type { AnnouncementView } from "@/lib/announcement";
import { deleteAnnouncement, saveAnnouncement } from "./actions";

const todayKey = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
// Status tayang dibanding hari ini (WIB).
function statusOf(a: Pick<AnnouncementView, "startDate" | "endDate">, today: string) {
  if (a.startDate > today) return { label: "Terjadwal", cls: "bg-sky-50 text-sky-700" };
  if (a.endDate && a.endDate < today) return { label: "Berakhir", cls: "bg-gray-100 text-gray-500" };
  return { label: "Tayang", cls: "bg-emerald-50 text-emerald-700" };
}
const empty = (today: string) => ({ title: "", body: "", pinned: false, startDate: today, endDate: "" });

// Pola standar portal: daftar pengumuman di kiri, formulir di kanan.
export default function PengumumanClient({ rows }: { rows: AnnouncementView[] }) {
  const t = useT();
  const canEdit = useCanEdit("pengaturan");
  const [today] = useState(todayKey);
  const [sel, setSel] = useState<string | null>(rows[0]?.id ?? null);
  const cur = rows.find((r) => r.id === sel) ?? null;
  const [form, setForm] = useState(() => (cur ? { ...cur, endDate: cur.endDate ?? "" } : empty(today)));
  const [pending, start] = useTransition();

  const open = (r: AnnouncementView | null) => { setSel(r?.id ?? null); setForm(r ? { ...r, endDate: r.endDate ?? "" } : empty(today)); };
  const save = () => start(async () => {
    const r = await saveAnnouncement(sel, { title: form.title, body: form.body, pinned: form.pinned, startDate: form.startDate, endDate: form.endDate });
    if (r.error) { showNotice(t(r.error), "error"); return; }
    setSel(r.id ?? null);
    showNotice(t(sel ? "Pengumuman diperbarui." : "Pengumuman disimpan. Karyawan menerima notifikasi saat pengumuman mulai tayang."));
  });
  const remove = async () => {
    if (!sel || !await askConfirm(t("Hapus pengumuman ini? Pengumuman tidak lagi tampil di Beranda karyawan."))) return;
    start(async () => { await deleteAnnouncement(sel); open(null); });
  };

  return (
    <div className="min-h-full bg-gray-50">
      <div className="border-b border-gray-100 bg-white px-6 py-4">
        <h2 className="font-bold text-gray-800"><T>Pengumuman</T></h2>
        <p className="mt-0.5 text-xs text-gray-400"><T>Pengumuman perusahaan yang tampil di Beranda seluruh karyawan sesuai periode tayangnya.</T></p>
      </div>
      <main className="max-w-6xl px-4 py-5 sm:px-6">
        <div className="grid gap-4 md:grid-cols-[18rem_minmax(0,1fr)]">
          <div className="space-y-3">
            {canEdit && (
              <Button onClick={() => open(null)} className="w-full gap-1.5"><Plus size={15} /> <T>Pengumuman Baru</T></Button>
            )}
            <nav className="h-fit overflow-hidden rounded-2xl border border-gray-200 bg-white">
              {rows.length === 0 && <p className="px-4 py-6 text-center text-sm text-gray-400"><T>Belum ada pengumuman.</T></p>}
              {rows.map((r) => {
                const on = r.id === sel, st = statusOf(r, today);
                return (
                  <button key={r.id} type="button" onClick={() => open(r)}
                    className={`flex w-full items-center gap-2.5 border-b border-gray-100 px-4 py-2.5 text-left last:border-b-0 ${on ? "bg-brand/10" : "hover:bg-gray-50"}`}>
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${on ? "bg-gradient-to-br from-brand to-rose-400 text-white" : "bg-gray-100 text-gray-500"}`}>
                      {r.pinned ? <Pin size={13} /> : <Megaphone size={14} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-sm ${on ? "font-semibold text-brand" : "text-gray-700"}`}>{r.title}</span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-gray-400">
                        <span className={`rounded-full px-1.5 py-px font-semibold ${st.cls}`}><T>{st.label}</T></span> {formatDate(r.startDate)}
                      </span>
                    </span>
                    <ChevronRight size={14} className={on ? "text-brand" : "text-gray-300"} />
                  </button>
                );
              })}
            </nav>
          </div>

          <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5">
            <h3 className="font-semibold text-gray-900"><T>{sel ? "Ubah Pengumuman" : "Pengumuman Baru"}</T></h3>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500"><T>Judul</T> *</label>
              {/* Kotak isian jelas (putih, bingkai abu). rounded-[12px], bukan rounded-xl: .bg-white.rounded-xl dianggap kartu kaca dan bingkainya jadi putih. */}
              <Input value={form.title} disabled={!canEdit} maxLength={200} onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="h-10 rounded-[12px] border border-gray-300 bg-white px-3 text-sm focus:border-brand disabled:bg-gray-50" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500"><T>Isi pengumuman</T> *</label>
              <textarea value={form.body} disabled={!canEdit} rows={8} onChange={(e) => setForm({ ...form, body: e.target.value })}
                className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand focus:outline-none disabled:bg-gray-50" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500"><T>Mulai tayang</T> *</label>
                <DateInput value={form.startDate} disabled={!canEdit} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500"><T>Selesai tayang (kosongkan bila tanpa batas)</T></label>
                <DateInput value={form.endDate} disabled={!canEdit} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
              </div>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={form.pinned} disabled={!canEdit} onChange={(e) => setForm({ ...form, pinned: e.target.checked })} className="h-4 w-4 accent-[var(--color-brand)]" />
              <T>Sematkan di urutan paling atas</T>
            </label>
            {canEdit && (
              <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-4">
                <Button onClick={save} disabled={pending} className="gap-1.5">
                  {pending ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} <T>Simpan</T>
                </Button>
                {sel && (
                  <Button variant="outline" onClick={remove} disabled={pending} className="gap-1.5 text-red-600 hover:text-red-700">
                    <Trash2 size={15} /> <T>Hapus</T>
                  </Button>
                )}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
