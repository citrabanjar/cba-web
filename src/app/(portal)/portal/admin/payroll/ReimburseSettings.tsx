"use client";

import { useState, useTransition } from "react";
import { Loader2, Save, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { T, useT } from "@/components/i18n";
import { useCanEdit } from "@/components/portal/edit-access";
import { showNotice } from "@/components/portal/Confirm";
import { proposedText } from "@/lib/approval-text";
import { RESET_OPTIONS, STATUS_OPTIONS, type ReimburseSettings as Settings } from "@/lib/reimburse-shared";
import { saveReimburseSettings } from "./actions";

const select = "h-9 w-full rounded-lg border border-input bg-white px-2 text-sm";

// Payroll & Benefit → Pengaturan → Reimbursement Pengobatan: parameter yang diatur Admin Payroll.
export default function ReimburseSettings({ settings }: { settings: Settings }) {
  const t = useT();
  const canEdit = useCanEdit();
  const [f, setF] = useState<Settings>(settings);
  const [pending, start] = useTransition();
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setF((x) => ({ ...x, [k]: v }));
  const field = (label: string, node: React.ReactNode, hint?: string) => (
    <div className="space-y-1.5">
      <Label className="text-xs"><T>{label}</T></Label>
      {node}
      {hint && <p className="text-[11px] text-gray-400"><T>{hint}</T></p>}
    </div>
  );
  const check = (k: "enabled" | "prorata" | "needDoctorLetter" | "taxable", label: string, hint: string) => (
    <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-gray-200 p-3">
      <input type="checkbox" checked={f[k]} disabled={!canEdit} onChange={(e) => set(k, e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--color-brand)]" />
      <span><span className="block text-sm font-medium text-gray-800"><T>{label}</T></span><span className="block text-[11px] text-gray-400"><T>{hint}</T></span></span>
    </label>
  );
  const save = () => start(async () => {
    const r = await saveReimburseSettings(f);
    if (r.error) void showNotice(t(r.error), "error");
    else void showNotice(r.proposed ? proposedText(r.proposed) : t("Pengaturan reimbursement tersimpan."));
  });

  return (
    <section className="rounded-2xl border border-gray-200 bg-white">
      <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 px-5 py-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-emerald-400 text-white"><Stethoscope size={17} /></span>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-gray-900"><T>Reimbursement Pengobatan</T></h3>
          <p className="text-xs text-gray-400"><T>Penggantian biaya pengobatan karyawan berdasarkan kuitansi. Yang disetujui dibayarkan di Proses Gaji berikutnya sesuai jadwal gajian.</T></p>
        </div>
      </div>
      <div className="space-y-4 p-5">
        {check("enabled", "Aktif", "Karyawan dapat mengajukan reimbursement dari Tombol HP.")}
        <div className="grid gap-3 sm:grid-cols-3">
          {field("Persentase penggantian (%)", <Input type="number" min={0} max={100} value={f.percent} disabled={!canEdit} onChange={(e) => set("percent", Number(e.target.value))} />, "Dari nominal kuitansi.")}
          {field("Plafon per tahun (Rp)", <Input type="number" min={0} value={f.yearlyCap} disabled={!canEdit} onChange={(e) => set("yearlyCap", Number(e.target.value))} />, "0 = tanpa plafon.")}
          {field("Plafon diperbarui", (
            <select value={f.reset} disabled={!canEdit} onChange={(e) => set("reset", e.target.value as Settings["reset"])} className={select}>
              {RESET_OPTIONS.map((o) => <option key={o.key} value={o.key}>{t(o.label)}</option>)}
            </select>))}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {field("Berlaku untuk", (
            <select value={f.forStatus} disabled={!canEdit} onChange={(e) => set("forStatus", e.target.value as Settings["forStatus"])} className={select}>
              {STATUS_OPTIONS.map((o) => <option key={o.key} value={o.key}>{t(o.label)}</option>)}
            </select>))}
          {field("Masa kerja minimal (bulan)", <Input type="number" min={0} value={f.minServiceMonths} disabled={!canEdit} onChange={(e) => set("minServiceMonths", Number(e.target.value))} />, "0 = langsung berhak.")}
          {field("Batas pengajuan (hari setelah berobat)", <Input type="number" min={0} value={f.deadlineDays} disabled={!canEdit} onChange={(e) => set("deadlineDays", Number(e.target.value))} />, "0 = tanpa batas.")}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {check("prorata", "Plafon prorata karyawan baru", "Masuk di tahun berjalan: plafon x sisa bulan / 12 (reset 1 Januari).")}
          {check("needDoctorLetter", "Surat dokter wajib", "Kuitansi selalu wajib; resep dilampirkan bila ada.")}
          {check("taxable", "Kena PPh 21", "Ikut penghasilan bruto saat Proses Gaji.")}
        </div>
        {canEdit && (
          <div className="flex justify-end">
            <Button disabled={pending} onClick={save} className="gap-1.5">{pending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} <T>Simpan</T></Button>
          </div>
        )}
      </div>
    </section>
  );
}
