"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Loader2, Plus, Receipt, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { T, useT } from "@/components/i18n";
import { useCanEdit } from "@/components/portal/edit-access";
import { rupiah } from "@/lib/payroll";
import { ptkpOf, taxYearConfig, type TaxYearConfig } from "@/lib/pph21";
import { saveTaxYear } from "./actions";

const thisYear = () => Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric" }).format(new Date()));

// Pengaturan PPh 21 per tahun pajak: PTKP, lapisan tarif Pasal 17, biaya jabatan.
// Tahun tanpa pengaturan memakai tahun terdekat sebelumnya (atau bawaan pemerintah).
export default function TaxSettings({ all }: { all: Record<string, TaxYearConfig> }) {
  const t = useT();
  const canEdit = useCanEdit(); // hak lihat saja: isian dikunci, tombol ubah/simpan disembunyikan
  const years = [...new Set([...Object.keys(all).map(Number), thisYear(), thisYear() + 1])].sort((a, b) => a - b);
  const [year, setYear] = useState(thisYear());
  const [form, setForm] = useState<TaxYearConfig>(() => taxYearConfig(all, thisYear()));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const saved = !!all[String(year)];
  const set = <K extends keyof TaxYearConfig>(k: K, v: TaxYearConfig[K]) => { setMsg(null); setForm((f) => ({ ...f, [k]: v })); };
  const setBracket = (i: number, patch: Partial<TaxYearConfig["brackets"][number]>) =>
    set("brackets", form.brackets.map((b, j) => (j === i ? { ...b, ...patch } : b)));
  function pickYear(y: number) {
    setYear(y); setMsg(null); setForm(taxYearConfig(all, y));
  }
  function save() {
    start(async () => {
      const r = await saveTaxYear(year, form);
      setMsg(r.error ? { ok: false, text: r.error } : { ok: true, text: "Pengaturan PPh 21 tersimpan." });
    });
  }
  const money = (k: "ptkpSelf" | "ptkpMarried" | "ptkpDependent" | "jobCostMaxMonthly", label: string) => (
    <div className="space-y-1.5"><Label className="text-xs"><T>{label}</T></Label>
      <Input type="number" min={0} value={form[k]} onChange={(e) => set(k, Number(e.target.value))} /></div>
  );
  return (
    <section className="rounded-2xl border border-gray-200 bg-white">
      <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 px-5 py-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-400 text-white"><Receipt size={17} /></span>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-gray-900"><T>Pengaturan PPh 21</T></h3>
          <p className="text-xs text-gray-400"><T>PTKP, tarif Pasal 17, dan biaya jabatan per tahun pajak. Dipakai saat menghitung PPh 21 setahun di masa pajak terakhir. Tarif TER bulanan mengikuti PP 58/2023.</T></p>
        </div>
        <select value={year} onChange={(e) => pickYear(Number(e.target.value))} className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm">
          {years.map((y) => <option key={y} value={y}>{t("Tahun pajak")} {y}{all[String(y)] ? "" : ` · ${t("belum diatur")}`}</option>)}
        </select>
      </div>
      {!saved && (
        <p className="mx-5 mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <T>Tahun ini belum diatur; angka di bawah diambil dari tahun sebelumnya atau ketentuan bawaan. Simpan untuk menetapkannya.</T>
        </p>
      )}
      <fieldset disabled={!canEdit} className="min-w-0 grid gap-5 p-5 lg:grid-cols-2">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400"><T>PTKP setahun</T></p>
          <div className="grid gap-3 sm:grid-cols-2">
            {money("ptkpSelf", "Wajib pajak sendiri (Rp)")}{money("ptkpMarried", "Tambahan kawin (Rp)")}
            {money("ptkpDependent", "Tambahan per tanggungan (Rp)")}
            <div className="space-y-1.5"><Label className="text-xs"><T>Tanggungan maksimal</T></Label>
              <Input type="number" min={0} max={10} value={form.maxDependents} onChange={(e) => set("maxDependents", Number(e.target.value))} /></div>
          </div>
          <div className="grid grid-cols-4 gap-1 rounded-lg bg-gray-50 p-2 text-[11px] text-gray-600">
            {["TK/0", "TK/3", "K/0", "K/3"].map((st) => <span key={st}><b>{st}</b><br />{rupiah(ptkpOf(st, form))}</span>)}
          </div>
          <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-gray-400"><T>Biaya jabatan</T></p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label className="text-xs"><T>Persen dari bruto (%)</T></Label>
              <Input type="number" min={0} step="0.5" value={form.jobCostRate} onChange={(e) => set("jobCostRate", Number(e.target.value))} /></div>
            {money("jobCostMaxMonthly", "Maksimal per bulan (Rp)")}
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400"><T>Tarif Pasal 17 (PKP setahun)</T></p>
          {form.brackets.map((b, i) => {
            const last = i === form.brackets.length - 1;
            const from = i ? form.brackets[i - 1].upTo ?? 0 : 0;
            return (
              <div key={i} className="flex flex-wrap items-center gap-2 text-xs">
                <span className="w-32 text-gray-500">{last ? `${t("di atas")} ${rupiah(from)}` : i ? `${rupiah(from)} – ` : t("s/d")}</span>
                {!last && <Input type="number" min={0} className="h-8 w-36" value={b.upTo ?? ""} onChange={(e) => setBracket(i, { upTo: Number(e.target.value) })} />}
                <Input type="number" min={0} step="0.5" className="h-8 w-16" value={b.rate} onChange={(e) => setBracket(i, { rate: Number(e.target.value) })} />
                <span className="text-gray-400">%</span>
                {canEdit && form.brackets.length > 1 && (
                  <button type="button" aria-label={t("Hapus baris")} className="rounded p-1 text-gray-400 hover:text-rose-600"
                    onClick={() => {
                      const next = form.brackets.filter((_, j) => j !== i);
                      next[next.length - 1] = { ...next[next.length - 1], upTo: null };
                      set("brackets", next);
                    }}><Trash2 size={13} /></button>
                )}
              </div>
            );
          })}
          {canEdit && <button type="button" className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
            onClick={() => {
              const prev = form.brackets.slice(0, -1), last = form.brackets[form.brackets.length - 1];
              const cap = (prev.length ? prev[prev.length - 1].upTo ?? 0 : 0) * 2 || 60_000_000;
              set("brackets", [...prev, { upTo: cap, rate: last.rate }, { upTo: null, rate: last.rate }]);
            }}>
            <Plus size={12} /> <T>Tambah lapisan</T>
          </button>}
        </div>
      </fieldset>
      {canEdit && <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-5 py-3">
        {msg && <span className={`flex items-center gap-1.5 text-sm ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>{msg.ok && <CheckCircle2 size={14} />}<T>{msg.text}</T></span>}
        <Button onClick={save} disabled={pending} className="gap-1.5">{pending && <Loader2 size={15} className="animate-spin" />} <T>Simpan Tahun</T> {year}</Button>
      </div>}
    </section>
  );
}
