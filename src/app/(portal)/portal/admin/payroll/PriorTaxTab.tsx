"use client";

import { useState, useTransition } from "react";
import { FileStack, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { T, useT } from "@/components/i18n";
import EmployeeCombobox from "@/components/portal/EmployeeCombobox";
import { askConfirm, showNotice } from "@/components/portal/Confirm";
import { useCanEdit } from "@/components/portal/edit-access";
import { proposedText } from "@/lib/approval-text";
import { deletePriorSlip, savePriorSlip } from "./actions";
import type { PayEmployee } from "./ComponentsTab";

export type PriorSlipRow = {
  id: string; userId: string; name: string; employeeId: string | null; year: number; employerName: string; employerNpwp: string | null;
  slipNumber: string; kind: string; monthFrom: number; monthTo: number; gross: number; net: number | null; pph21: number; note: string | null;
};
const rp = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;
const digits = (v: string) => Number(v.replace(/\D/g, "") || 0);
const field = "h-10 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand/40";
type Form = { id: string | null; employeeId: string; year: number; slipNumber: string; net: string; pph21: string; employerName: string };
const thisYear = () => new Date(Date.now() + 7 * 3600_000).getUTCFullYear();

// Payroll & Benefit → PPh 21 Pindahan: data BPA1 dari pemberi kerja sebelumnya (karyawan pindah di tahun yang sama).
// Sesuai Coretax: pemberi kerja baru memasukkan nomor BPA1 sebelumnya; yang dipakai hitungan hanya penghasilan neto
// dan PPh 21 yang telah dipotong masa sebelumnya.
export default function PriorTaxTab({ slips, employees }: { slips: PriorSlipRow[]; employees: PayEmployee[] }) {
  const t = useT();
  const canEdit = useCanEdit("gaji");
  const [form, setForm] = useState<Form | null>(null);
  const [pending, start] = useTransition();
  const blank = (): Form => ({ id: null, employeeId: "", year: thisYear(), slipNumber: "", net: "", pph21: "", employerName: "" });
  const emp = form ? employees.find((e) => e.employeeId && e.employeeId.toLowerCase() === form.employeeId.trim().toLowerCase()) : undefined;
  const save = () => form && start(async () => {
    if (!emp) { void showNotice(t("Pilih karyawan dari daftar."), "error"); return; }
    const r = await savePriorSlip(form.id, {
      userId: emp.id, year: form.year, slipNumber: form.slipNumber, net: digits(form.net), pph21: digits(form.pph21), employerName: form.employerName,
      employerNpwp: "", kind: "BPA1", monthFrom: 1, monthTo: 12, gross: 0, note: "",
    });
    if (r.error) { void showNotice(t(r.error), "error"); return; }
    void showNotice(r.proposed ? proposedText(r.proposed) : t("Data PPh 21 pindahan tersimpan."));
    setForm(null);
  });
  const remove = async (s: PriorSlipRow) => {
    if (!(await askConfirm(t("Hapus data PPh 21 pindahan ini?")))) return;
    start(async () => { const r = await deletePriorSlip(s.id); if (r.error) void showNotice(t(r.error), "error"); else if (r.proposed) void showNotice(proposedText(r.proposed)); });
  };
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  return (
    <section className="rounded-2xl border border-gray-200 bg-white">
      <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 px-5 py-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-rose-400 text-white"><FileStack size={17} /></span>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-gray-900"><T>PPh 21 Pindahan</T></h3>
          <p className="text-xs text-gray-400"><T>Karyawan yang tahun ini pindah dari pemberi kerja lain: isi dari BPA1 pemberi kerja sebelumnya. Dipakai di hitung ulang PPh 21 Desember / bulan keluar dan 1721-A1. Nomor BPA1 dimasukkan juga di Coretax saat membuat BPA1 Desember.</T></p>
        </div>
        {canEdit && !form && (
          <button type="button" onClick={() => setForm(blank())} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-ink px-4 text-xs font-semibold text-white hover:bg-ink/85">
            <Plus size={14} /> <T>Tambah</T>
          </button>
        )}
      </div>

      {form && (
        <div className="space-y-3 border-b border-gray-100 bg-gray-50/60 p-5">
          <div className="grid gap-3 sm:grid-cols-[1.4fr_0.5fr_1fr]">
            <div><label className="mb-1 block text-xs font-medium text-gray-500"><T>Karyawan</T></label>
              <EmployeeCombobox id="prior-emp" value={form.employeeId} onChange={(v) => set("employeeId", v)} placeholder={t("Ketik ID atau nama karyawan...")}
                className="h-10 rounded-xl !border-gray-300 !bg-white text-sm" options={employees.filter((e) => e.employeeId).map((e) => ({ value: e.employeeId!, label: e.name }))} />
              {emp && <p className="mt-1 text-xs text-emerald-700">{emp.name}</p>}
            </div>
            <div><label className="mb-1 block text-xs font-medium text-gray-500"><T>Tahun pajak</T></label>
              <input type="number" value={form.year} onChange={(e) => set("year", Number(e.target.value))} className={field} /></div>
            <div><label className="mb-1 block text-xs font-medium text-gray-500"><T>Nomor BPA1 pemberi kerja sebelumnya</T></label>
              <input value={form.slipNumber} onChange={(e) => set("slipNumber", e.target.value)} className={field} /></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div><label className="mb-1 block text-xs font-medium text-gray-500"><T>Penghasilan neto masa sebelumnya</T></label>
              <input inputMode="numeric" value={form.net} onChange={(e) => set("net", e.target.value)} className={field} /></div>
            <div><label className="mb-1 block text-xs font-medium text-gray-500"><T>PPh 21 yang telah dipotong masa sebelumnya</T></label>
              <input inputMode="numeric" value={form.pph21} onChange={(e) => set("pph21", e.target.value)} className={field} /></div>
            <div><label className="mb-1 block text-xs font-medium text-gray-500"><T>Nama pemberi kerja sebelumnya (opsional)</T></label>
              <input value={form.employerName} onChange={(e) => set("employerName", e.target.value)} className={field} /></div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setForm(null)} className="inline-flex items-center gap-1 rounded-full px-4 py-2 text-sm text-gray-500 hover:bg-gray-100"><X size={14} /> <T>Batal</T></button>
            <button type="button" disabled={pending} onClick={save} className="inline-flex items-center gap-1.5 rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {pending && <Loader2 size={14} className="animate-spin" />} <T>Simpan</T>
            </button>
          </div>
        </div>
      )}

      {slips.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-gray-400"><T>Belum ada data PPh 21 pindahan.</T></p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] whitespace-nowrap text-sm">
            <thead className="bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-400">
              <tr><th className="px-4 py-2"><T>Karyawan</T></th><th className="px-3 py-2"><T>Tahun</T></th><th className="px-3 py-2"><T>Nomor BPA1 sebelumnya</T></th>
                <th className="px-3 py-2 text-right"><T>Neto masa sebelumnya</T></th><th className="px-3 py-2 text-right"><T>PPh 21 masa sebelumnya</T></th><th /></tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {slips.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-2"><p className="font-medium text-gray-800">{s.name}</p><p className="text-[11px] text-gray-400">{s.employeeId}</p></td>
                  <td className="px-3 py-2">{s.year}</td>
                  <td className="px-3 py-2">{s.slipNumber}{s.employerName && <p className="text-[11px] text-gray-400">{s.employerName}</p>}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{rp(s.net ?? 0)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{rp(s.pph21)}</td>
                  <td className="px-3 py-2 text-right">
                    {canEdit && (
                      <span className="inline-flex gap-1">
                        <button type="button" aria-label={t("Ubah")} onClick={() => setForm({ id: s.id, employeeId: s.employeeId ?? "", year: s.year, slipNumber: s.slipNumber, net: String(s.net ?? ""), pph21: String(s.pph21), employerName: s.employerName })}
                          className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-brand"><Pencil size={14} /></button>
                        <button type="button" aria-label={t("Hapus")} disabled={pending} onClick={() => remove(s)} className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-brand"><Trash2 size={14} /></button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
