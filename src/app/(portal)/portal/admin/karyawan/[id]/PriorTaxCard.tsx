"use client";

import { useState, useTransition } from "react";
import { FileStack, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { T, useT } from "@/components/i18n";
import { askConfirm, showNotice } from "@/components/portal/Confirm";
import { useCanEdit } from "@/components/portal/edit-access";
import { proposedText } from "@/lib/approval-text";
import { deletePriorSlip, savePriorSlip } from "../../payroll/actions";

export type PriorSlipItem = { id: string; year: number; slipNumber: string; net: number; pph21: number; employerName: string };
const rp = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;
const digits = (v: string) => Number(v.replace(/\D/g, "") || 0);
const field = "h-10 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand/40";
type Form = { id: string | null; year: number; slipNumber: string; net: string; pph21: string; employerName: string };
const thisYear = () => new Date(Date.now() + 7 * 3600_000).getUTCFullYear();

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="grid grid-cols-[minmax(0,7.5rem)_auto_minmax(0,1fr)] gap-x-2 text-sm sm:grid-cols-[13rem_auto_minmax(0,1fr)]">
    <span className="text-gray-500"><T>{label}</T></span>
    <span aria-hidden className="text-gray-400">:</span>
    <span className="font-medium text-gray-900 break-words">{children || "—"}</span>
  </div>
);

// Profil karyawan → Payroll: PPh 21 pindahan (karyawan yang pindah dari pemberi kerja lain di tahun yang sama).
// Diisi sekali dari BPA1 pemberi kerja sebelumnya: nomor BPA1, penghasilan neto, PPh 21 yang telah dipotong.
// embedded: tampil di dalam bagian profil gaya CV yang sudah berjudul, jadi ikon & judul sendiri tidak diulang.
export default function PriorTaxCard({ userId, slips, embedded = false }: { userId: string; slips: PriorSlipItem[]; embedded?: boolean }) {
  const t = useT();
  const canEdit = useCanEdit("gaji");
  const [form, setForm] = useState<Form | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const save = () => form && start(async () => {
    const r = await savePriorSlip(form.id, {
      userId, year: form.year, slipNumber: form.slipNumber, net: digits(form.net), pph21: digits(form.pph21), employerName: form.employerName,
      employerNpwp: "", kind: "BPA1", monthFrom: 1, monthTo: 12, gross: 0, note: "",
    });
    if (r.error) { void showNotice(t(r.error), "error"); return; }
    void showNotice(r.proposed ? proposedText(r.proposed) : t("Data PPh 21 pindahan tersimpan."));
    setForm(null);
  });
  const remove = async (s: PriorSlipItem) => {
    if (!(await askConfirm(t("Hapus data PPh 21 pindahan ini?")))) return;
    start(async () => { const r = await deletePriorSlip(s.id); if (r.error) void showNotice(t(r.error), "error"); else if (r.proposed) void showNotice(proposedText(r.proposed)); });
  };
  if (!slips.length && !canEdit) return null;

  const formBlock = form && (
        <div className={embedded ? "space-y-3 rounded-xl bg-gray-50/80 p-4" : "space-y-3 border-b border-gray-100 bg-gray-50/60 p-5"}>
          <div className="grid gap-3 sm:grid-cols-[0.5fr_1fr_1fr]">
            <div><label className="mb-1 block text-xs font-medium text-gray-500"><T>Tahun pajak</T></label>
              <input type="text" inputMode="numeric" autoComplete="off" value={form.year || ""} onFocus={(e) => e.target.select()} onChange={(e) => set("year", Number(e.target.value.replace(/\D/g, "").slice(0, 4)))} className={field} /></div>
            <div><label className="mb-1 block text-xs font-medium text-gray-500"><T>Nomor BPA1 pemberi kerja sebelumnya</T></label>
              <input value={form.slipNumber} onChange={(e) => set("slipNumber", e.target.value)} className={field} /></div>
            <div><label className="mb-1 block text-xs font-medium text-gray-500"><T>Nama pemberi kerja sebelumnya (opsional)</T></label>
              <input value={form.employerName} onChange={(e) => set("employerName", e.target.value)} className={field} /></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="mb-1 block text-xs font-medium text-gray-500"><T>Penghasilan neto masa sebelumnya</T></label>
              <input inputMode="numeric" value={form.net} onChange={(e) => set("net", e.target.value)} className={field} /></div>
            <div><label className="mb-1 block text-xs font-medium text-gray-500"><T>PPh 21 yang telah dipotong masa sebelumnya</T></label>
              <input inputMode="numeric" value={form.pph21} onChange={(e) => set("pph21", e.target.value)} className={field} /></div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setForm(null)} className="inline-flex items-center gap-1 rounded-full px-4 py-2 text-sm text-gray-500 hover:bg-gray-100"><X size={14} /> <T>Batal</T></button>
            <button type="button" disabled={pending} onClick={save} className="inline-flex items-center gap-1.5 rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {pending && <Loader2 size={14} className="animate-spin" />} <T>Simpan</T>
            </button>
          </div>
        </div>
  );
  const edit = (s: PriorSlipItem) => setForm({ id: s.id, year: s.year, slipNumber: s.slipNumber, net: String(s.net), pph21: String(s.pph21), employerName: s.employerName });

  // Di profil karyawan (gaya CV): baris "Label : Isi" tanpa kartu, sama seperti bagian lain.
  if (embedded) return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="max-w-2xl text-xs text-gray-500"><T>Hanya untuk karyawan yang tahun ini pindah dari pemberi kerja lain. Isi sekali dari BPA1 pemberi kerja sebelumnya; dipakai di hitung ulang PPh 21 Desember / bulan keluar dan 1721-A1.</T></p>
        {canEdit && !form && (
          <button type="button" onClick={() => setForm({ id: null, year: thisYear(), slipNumber: "", net: "", pph21: "", employerName: "" })}
            className="inline-flex h-7 items-center gap-1.5 rounded-full bg-ink px-3 text-xs font-semibold text-white hover:bg-ink/85">
            <Plus size={12} /> <T>Isi</T>
          </button>
        )}
      </div>
      {formBlock}
      {slips.length === 0
        ? !form && <Row label="Status">{t("Bukan karyawan pindahan")}</Row>
        : slips.map((s) => (
          <div key={s.id} className="space-y-2 border-t border-gray-100 pt-3 first:border-t-0 first:pt-0">
            <Row label="Tahun Pajak">
              <span className="inline-flex items-center gap-2">{s.year}
                {canEdit && (
                  <span className="inline-flex gap-1">
                    <button type="button" aria-label={t("Ubah")} onClick={() => edit(s)} className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-brand"><Pencil size={13} /></button>
                    <button type="button" aria-label={t("Hapus")} disabled={pending} onClick={() => remove(s)} className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-brand"><Trash2 size={13} /></button>
                  </span>
                )}
              </span>
            </Row>
            <Row label="Nomor BPA1">{s.slipNumber}</Row>
            <Row label="Pemberi Kerja Sebelumnya">{s.employerName}</Row>
            <Row label="Penghasilan Neto">{rp(s.net)}</Row>
            <Row label="PPh 21 Dipotong">{rp(s.pph21)}</Row>
          </div>
        ))}
    </div>
  );


  return (
    <section className="rounded-2xl border border-gray-200 bg-white">
      <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 px-5 py-4">
        {!embedded && <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-rose-400 text-white"><FileStack size={17} /></span>}
        <div className="min-w-0 flex-1">
          {!embedded && <h3 className="font-semibold text-gray-900"><T>PPh 21 Pindahan</T></h3>}
          <p className="text-xs text-gray-400"><T>Hanya untuk karyawan yang tahun ini pindah dari pemberi kerja lain. Isi sekali dari BPA1 pemberi kerja sebelumnya; dipakai di hitung ulang PPh 21 Desember / bulan keluar dan 1721-A1.</T></p>
        </div>
        {canEdit && !form && (
          <button type="button" onClick={() => setForm({ id: null, year: thisYear(), slipNumber: "", net: "", pph21: "", employerName: "" })}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-ink px-4 text-xs font-semibold text-white hover:bg-ink/85">
            <Plus size={14} /> <T>Isi</T>
          </button>
        )}
      </div>

      {formBlock}

      {slips.length === 0 ? (
        !form && <p className="px-5 py-5 text-sm text-gray-400"><T>Bukan karyawan pindahan (belum ada data).</T></p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {slips.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-gray-900">{s.year} · BPA1 {s.slipNumber}</p>
                <p className="text-xs text-gray-500">{s.employerName && <>{s.employerName} · </>}<T>neto</T> {rp(s.net)} · PPh 21 {rp(s.pph21)}</p>
              </div>
              {canEdit && (
                <span className="inline-flex gap-1">
                  <button type="button" aria-label={t("Ubah")} onClick={() => edit(s)}
                    className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-brand"><Pencil size={14} /></button>
                  <button type="button" aria-label={t("Hapus")} disabled={pending} onClick={() => remove(s)} className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-brand"><Trash2 size={14} /></button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
