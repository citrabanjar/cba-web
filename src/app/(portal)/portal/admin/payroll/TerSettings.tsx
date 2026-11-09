"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Loader2, Plus, Percent, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { T, useT } from "@/components/i18n";
import { rupiah } from "@/lib/payroll";
import { DEFAULT_TER, type TerRow, type TerVersion } from "@/lib/pph21";
import { deleteTerVersion, saveTerVersion } from "./actions";

const TABLES = [
  { key: "A", label: "Kategori A", hint: "TK/0, TK/1, K/0" },
  { key: "B", label: "Kategori B", hint: "TK/2, TK/3, K/1, K/2" },
  { key: "C", label: "Kategori C", hint: "K/3" },
  { key: "daily", label: "Harian", hint: "Karyawan harian/mingguan, per rata-rata penghasilan sehari" },
] as const;
type TableKey = (typeof TABLES)[number]["key"];
const fmtDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

// Tarif TER PPh 21 (PP 58/2023) yang bisa diubah, per versi dengan tanggal berlaku.
export default function TerSettings({ versions }: { versions: TerVersion[] }) {
  const t = useT();
  const all = versions.length ? versions : [];
  const latest = all[all.length - 1];
  const [selected, setSelected] = useState<string | null>(latest?.effectiveDate ?? null); // null = bawaan / versi baru
  const [form, setForm] = useState<TerVersion>(() => latest ?? DEFAULT_TER);
  const [table, setTable] = useState<TableKey>("A");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const rows = form[table];
  const setRows = (r: TerRow[]) => { setMsg(null); setForm((f) => ({ ...f, [table]: r })); };

  function pick(v: string) {
    setMsg(null);
    if (v === "__new") {
      const base = latest ?? DEFAULT_TER;
      setSelected(null);
      setForm({ ...base, effectiveDate: "" });
    } else if (v === "__default") {
      setSelected(null);
      setForm(DEFAULT_TER);
    } else {
      setSelected(v);
      setForm(all.find((x) => x.effectiveDate === v) ?? DEFAULT_TER);
    }
  }
  function save() {
    start(async () => {
      const r = await saveTerVersion(selected, form);
      if (r.error) setMsg({ ok: false, text: r.error });
      else { setSelected(form.effectiveDate); setMsg({ ok: true, text: "Tarif TER tersimpan." }); }
    });
  }
  function remove() {
    if (!selected || !window.confirm(t("Hapus versi tarif TER ini?"))) return;
    start(async () => {
      await deleteTerVersion(selected);
      pick("__default");
    });
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white">
      <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 px-5 py-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-rose-500 to-pink-400 text-white"><Percent size={17} /></span>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-gray-900"><T>Tarif TER PPh 21</T></h3>
          <p className="text-xs text-gray-400"><T>Tarif efektif rata-rata bulanan (kategori A/B/C) dan harian. Proses Gaji memakai versi yang berlaku pada akhir periode.</T></p>
        </div>
        <select value={selected ?? (form.effectiveDate ? "__default" : "__new")} onChange={(e) => pick(e.target.value)}
          className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm">
          {all.map((v) => <option key={v.effectiveDate} value={v.effectiveDate}>{t("Berlaku")} {fmtDate(v.effectiveDate)}</option>)}
          <option value="__default">{t("Bawaan PP 58/2023")} · {fmtDate(DEFAULT_TER.effectiveDate)}</option>
          <option value="__new">+ {t("Versi baru")}</option>
        </select>
      </div>
      {!all.length && (
        <p className="mx-5 mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <T>Belum ada versi tersimpan; Proses Gaji memakai tarif bawaan PP 58/2023. Simpan untuk menetapkan versi pertama.</T>
        </p>
      )}
      <div className="space-y-4 p-5">
        <div className="space-y-1.5 sm:w-60"><Label className="text-xs"><T>Berlaku mulai tanggal</T></Label>
          <Input type="date" value={form.effectiveDate} onChange={(e) => { setMsg(null); setForm((f) => ({ ...f, effectiveDate: e.target.value })); }} /></div>
        <div className="flex flex-wrap gap-1 rounded-xl bg-gray-50 p-1">
          {TABLES.map((x) => (
            <button key={x.key} type="button" onClick={() => setTable(x.key)}
              className={`rounded-lg px-3 py-1.5 text-left text-xs ${table === x.key ? "bg-ink text-white" : "text-gray-600 hover:bg-gray-100"}`}>
              <b><T>{x.label}</T></b><span className="block text-[10px] opacity-75"><T>{x.hint}</T></span>
            </button>
          ))}
        </div>
        <div className="max-h-96 space-y-1 overflow-y-auto pr-1">
          {rows.map((r, i) => {
            const last = i === rows.length - 1;
            const from = i ? rows[i - 1].upTo ?? 0 : 0;
            return (
              <div key={i} className="flex flex-wrap items-center gap-2 text-xs">
                <span className="w-6 text-right text-gray-400">{i + 1}</span>
                <span className="w-40 text-gray-500">{last ? `${t("di atas")} ${rupiah(from)}` : i ? `${rupiah(from)} – ` : t("s/d")}</span>
                {!last && <Input type="number" min={0} className="h-8 w-36" value={r.upTo ?? ""} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, upTo: Number(e.target.value) } : x)))} />}
                <Input type="number" min={0} step="0.25" className="h-8 w-20" value={r.rate} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, rate: Number(e.target.value) } : x)))} />
                <span className="text-gray-400">%</span>
                {rows.length > 1 && (
                  <button type="button" aria-label={t("Hapus baris")} className="rounded p-1 text-gray-400 hover:text-rose-600"
                    onClick={() => { const next = rows.filter((_, j) => j !== i); next[next.length - 1] = { ...next[next.length - 1], upTo: null }; setRows(next); }}>
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <button type="button" className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
          onClick={() => {
            const prev = rows.slice(0, -1), last = rows[rows.length - 1];
            const cap = (prev.length ? prev[prev.length - 1].upTo ?? 0 : 0) + 100_000;
            setRows([...prev, { upTo: cap, rate: last.rate }, { upTo: null, rate: last.rate }]);
          }}>
          <Plus size={12} /> <T>Tambah baris</T>
        </button>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-gray-100 px-5 py-3">
        {msg && <span className={`flex items-center gap-1.5 text-sm ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>{msg.ok && <CheckCircle2 size={14} />}<T>{msg.text}</T></span>}
        {selected && <Button variant="outline" onClick={remove} disabled={pending} className="text-rose-600"><T>Hapus Versi</T></Button>}
        <Button onClick={save} disabled={pending} className="gap-1.5">{pending && <Loader2 size={15} className="animate-spin" />} <T>Simpan Tarif TER</T></Button>
      </div>
    </section>
  );
}
