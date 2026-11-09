"use client";

import { useState, useTransition } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { T, useT } from "@/components/i18n";
import {
  NEEDS_BASE, NEEDS_PARAM, PAY_BASES, PAY_CATEGORIES, PAY_KINDS, PAY_METHODS, PAY_PARAMS, defaultRestTiers, describe, isTaxableCategory,
  legalWarning, overtimeTiers, paramUnit, type PayComponentInput, type PayParams, type Tier,
} from "@/lib/payroll";
import { savePayComponent } from "./actions";
import type { Component } from "./ComponentsTab";

const EMPTY: PayComponentInput = {
  code: "", name: "", kind: "PENDAPATAN", category: "TUNJANGAN_LAIN", method: "INPUT", param: null,
  amount: null, rate: null, base: null, capAmount: null, floorAmount: null, params: { prorate: true }, baseCodes: [], taxable: true, legalBasis: "", note: "", isActive: true,
};
const select = "h-9 w-full rounded-lg border border-input bg-white px-2 text-sm";

// Daftar baris tarif lembur: "sampai jam ke-" + pengali. Baris terakhir = jam berikutnya.
function TierEditor({ tiers, onChange }: { tiers: Tier[]; onChange: (t: Tier[]) => void }) {
  const t = useT();
  const set = (i: number, patch: Partial<Tier>) => onChange(tiers.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <div className="space-y-1.5">
      {tiers.map((tier, i) => {
        const last = i === tiers.length - 1;
        return (
          <div key={i} className="flex flex-wrap items-center gap-2 text-xs">
            <span className="w-28 text-gray-600">{last ? t(i ? "Jam berikutnya" : "Semua jam") : `${t("Sampai jam ke-")}`}</span>
            {!last && (
              <Input type="number" min={0} step="0.5" className="h-8 w-16" value={tier.upTo ?? ""}
                onChange={(e) => set(i, { upTo: Number(e.target.value) || 0 })} />
            )}
            <span className="text-gray-500"><T>pengali</T></span>
            <Input type="number" min={0} step="0.5" className="h-8 w-16" value={tier.x}
              onChange={(e) => set(i, { x: Number(e.target.value.replace(",", ".")) || 0 })} />
            <span className="text-gray-400">x</span>
            {tiers.length > 1 && (
              <button type="button" aria-label={t("Hapus baris")} className="rounded p-1 text-gray-400 hover:text-rose-600"
                onClick={() => {
                  const next = tiers.filter((_, j) => j !== i);
                  next[next.length - 1] = { ...next[next.length - 1], upTo: null };
                  onChange(next);
                }}>
                <Trash2 size={13} />
              </button>
            )}
          </div>
        );
      })}
      <button type="button" className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
        onClick={() => {
          const prev = tiers.slice(0, -1);
          const lastCap = prev.length ? prev[prev.length - 1].upTo ?? 0 : 0;
          onChange([...prev, { upTo: lastCap + 1, x: tiers[tiers.length - 1].x }, { upTo: null, x: tiers[tiers.length - 1].x }]);
        }}>
        <Plus size={12} /> <T>Tambah baris tarif</T>
      </button>
    </div>
  );
}

export default function ComponentDialog({ comp, all, workDaysPerWeek, onClose, onCreated }: {
  comp: Component | "new"; all: Component[]; workDaysPerWeek: 5 | 6; onClose: () => void; onCreated: (id: string) => void;
}) {
  const t = useT();
  const [form, setForm] = useState<PayComponentInput>(() => (comp === "new" ? EMPTY : { ...comp, legalBasis: comp.legalBasis ?? "", note: comp.note ?? "" }));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof PayComponentInput>(k: K, v: PayComponentInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const numOrNull = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));
  const setParam = (patch: Partial<PayParams>) => setForm((f) => ({ ...f, params: { ...(f.params ?? {}), ...patch } }));
  const p = form.params ?? {};
  const system = form.method === "PPH21";
  const isInput = form.method === "INPUT";
  const method = PAY_METHODS.find((m) => m.key === form.method);
  const category = PAY_CATEGORIES.find((c) => c.key === form.category);
  const unit = paramUnit(form.param);
  const legal = legalWarning(form, workDaysPerWeek);
  const tiers = overtimeTiers(p, workDaysPerWeek);
  // Komponen yang bisa dicentang sebagai dasar nilai: gaji pokok + pendapatan bernilai tetap.
  const baseOptions = [
    { code: "GP", name: "Gaji Pokok" },
    ...all.filter((c) => c.kind === "PENDAPATAN" && c.code !== "GP" && c.code !== form.code && (c.method === "INPUT" || c.method === "NOMINAL")),
  ];

  function chooseMode(mode: "INPUT" | "RUMUS") {
    if (mode === "INPUT") setForm((f) => ({ ...f, method: "INPUT", param: null, base: null }));
    else if (isInput) setForm((f) => ({ ...f, method: "PER_SATUAN", param: f.param ?? "HARI_HADIR" }));
  }
  function chooseMethod(m: string) {
    setForm((f) => ({
      ...f, method: m,
      param: NEEDS_PARAM.includes(m) ? f.param ?? (m === "PRORATA" ? "HARI_MANGKIR" : "HARI_HADIR") : m === "LEMBUR" ? "JAM_LEMBUR" : m === "THR" ? "MASA_KERJA" : null,
      base: NEEDS_BASE.includes(m) ? f.base ?? "UPAH_TETAP" : null,
      params: m === "LEMBUR" ? { divisor: 173, work: tiers.work, rest: tiers.rest, ...(f.params ?? {}) }
        : m === "THR" ? { months: 1, minMonths: 1, proportional: true, ...(f.params ?? {}) } : f.params,
    }));
  }

  function save() {
    setError(null);
    start(async () => {
      const r = await savePayComponent(comp === "new" ? null : comp.id, form);
      if (r.error) setError(r.error);
      else {
        onClose();
        if (comp === "new" && r.id) onCreated(r.id);
      }
    });
  }

  const tab = (on: boolean) => `flex-1 rounded-lg px-3 py-2 text-left text-sm ${on ? "bg-ink text-white shadow-sm" : "text-gray-600 hover:bg-gray-100"}`;
  const check = (checked: boolean, onChange: (v: boolean) => void, label: string, hint: string) => (
    <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-gray-200 px-3 py-2">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--color-brand)]" />
      <span><span className="block text-sm font-medium text-gray-800"><T>{label}</T></span>
        <span className="block text-[11px] text-gray-400"><T>{hint}</T></span></span>
    </label>
  );
  return (
    <Dialog open onOpenChange={(o: boolean) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle><T>{comp === "new" ? "Tambah Komponen" : "Ubah Komponen"}</T></DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[110px_1fr]">
            <div className="space-y-1.5"><Label className="text-xs"><T>Kode</T></Label>
              <Input value={form.code} maxLength={8} disabled={system || form.code === "GP" && comp !== "new"} onChange={(e) => set("code", e.target.value.toUpperCase())} /></div>
            <div className="space-y-1.5"><Label className="text-xs"><T>Nama</T></Label>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} /></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label className="text-xs"><T>Jenis</T></Label>
              <select value={form.kind} disabled={system} onChange={(e) => set("kind", e.target.value)} className={select}>
                {PAY_KINDS.map((k) => <option key={k.key} value={k.key}>{t(k.label)}</option>)}
              </select></div>
            <div className="space-y-1.5"><Label className="text-xs"><T>Kategori pajak</T></Label>
              <select value={form.category} disabled={system} onChange={(e) => set("category", e.target.value)} className={select}>
                {PAY_CATEGORIES.map((k) => <option key={k.key} value={k.key}>{t(k.label)}</option>)}
              </select>
              {category && <p className="text-[11px] text-gray-400"><T>{category.hint}</T> {isTaxableCategory(category.key) ? t("Objek PPh 21.") : t("Bukan penambah bruto PPh 21.")}</p>}</div>
          </div>

          {system ? (
            <p className="rounded-xl bg-gray-50 px-3 py-3 text-sm text-gray-600">
              <T>Komponen sistem. PPh 21 dihitung otomatis mengikuti ketentuan pemerintah (TER bulanan, dihitung ulang setahun di masa pajak terakhir). PTKP, tarif Pasal 17, dan biaya jabatan diatur per tahun di tab Pengaturan. Tempel ke karyawan yang dipotong PPh 21.</T>
            </p>
          ) : (
            <div className="space-y-3 rounded-xl border border-gray-200 p-3">
              <p className="text-xs font-semibold text-gray-600"><T>Nilai komponen</T></p>
              <div className="flex gap-1 rounded-xl bg-gray-50 p-1">
                <button type="button" className={tab(isInput)} onClick={() => chooseMode("INPUT")}>
                  <b><T>Input</T></b><span className="block text-[11px] opacity-75"><T>Nilainya diisi admin di profil karyawan</T></span>
                </button>
                <button type="button" className={tab(!isInput)} onClick={() => chooseMode("RUMUS")} disabled={form.code === "GP" && comp !== "new"}>
                  <b><T>Rumus</T></b><span className="block text-[11px] opacity-75"><T>Dihitung dari parameter data</T></span>
                </button>
              </div>

              {!isInput && (
                <>
                  <div className="space-y-1.5"><Label className="text-xs"><T>Cara hitung</T></Label>
                    <select value={form.method} onChange={(e) => chooseMethod(e.target.value)} className={select}>
                      {PAY_METHODS.filter((m) => m.key !== "INPUT").map((k) => <option key={k.key} value={k.key}>{t(k.label)}</option>)}
                    </select>
                    {method && <p className="text-[11px] text-gray-400"><T>{method.hint}</T></p>}</div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    {NEEDS_PARAM.includes(form.method) && (
                      <div className="space-y-1.5"><Label className="text-xs"><T>Parameter</T></Label>
                        <select value={form.param ?? ""} onChange={(e) => set("param", e.target.value)} className={select}>
                          {PAY_PARAMS.map((k) => <option key={k.key} value={k.key}>{t(k.label)}</option>)}
                        </select></div>
                    )}
                    {NEEDS_BASE.includes(form.method) && (
                      <div className="space-y-1.5"><Label className="text-xs"><T>Dasar nilai</T></Label>
                        <select value={form.base ?? "UPAH_TETAP"} onChange={(e) => set("base", e.target.value)} className={select}>
                          {PAY_BASES.map((k) => <option key={k.key} value={k.key}>{t(k.label)}</option>)}
                        </select></div>
                    )}
                  </div>
                  {NEEDS_BASE.includes(form.method) && form.base === "KOMPONEN" && (
                    <div className="flex flex-wrap gap-2">
                      {baseOptions.map((o) => (
                        <label key={o.code} className="flex cursor-pointer items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1 text-xs">
                          <input type="checkbox" checked={form.baseCodes.includes(o.code)} className="h-3.5 w-3.5 accent-[var(--color-brand)]"
                            onChange={(e) => set("baseCodes", e.target.checked ? [...form.baseCodes, o.code] : form.baseCodes.filter((x) => x !== o.code))} />
                          <b>{o.code}</b> {t(o.name)}
                        </label>
                      ))}
                    </div>
                  )}

                  {form.method === "NOMINAL" && (
                    <div className="space-y-1.5 sm:w-1/2"><Label className="text-xs"><T>Nominal per bulan (Rp)</T></Label>
                      <Input type="number" min={0} value={form.amount ?? ""} onChange={(e) => set("amount", numOrNull(e.target.value))} /></div>
                  )}
                  {form.method === "PER_SATUAN" && (
                    <div className="space-y-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5"><Label className="text-xs">{p.step ? t("Nominal per kelipatan (Rp)") : `${t("Nominal per")} ${t(unit)} (Rp)`}</Label>
                          <Input type="number" min={0} value={form.amount ?? ""} onChange={(e) => set("amount", numOrNull(e.target.value))} /></div>
                        <div className="space-y-1.5"><Label className="text-xs">{t("Syarat minimal")} ({t(unit)})</Label>
                          <Input type="number" min={0} step="0.5" value={p.min ?? ""} placeholder={t("tanpa syarat")}
                            onChange={(e) => setParam({ min: numOrNull(e.target.value) ?? undefined })} />
                          {form.param === "JAM_LEMBUR" && <p className="text-[11px] text-gray-400"><T>Dicek per lembur; lembur di bawah syarat tidak dihitung.</T></p>}</div>
                      </div>
                      <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                        <input type="checkbox" checked={!!p.step} className="h-4 w-4 accent-[var(--color-brand)]"
                          onChange={(e) => setParam({ step: e.target.checked ? p.min || 4 : undefined })} />
                        <T>Berlaku kelipatan</T>
                      </label>
                      {!!p.step && (
                        <div className="space-y-1.5 sm:w-1/2"><Label className="text-xs">{t("Kelipatan")} ({t(unit)})</Label>
                          <Input type="number" min={0} step="0.5" value={p.step ?? ""} onChange={(e) => setParam({ step: Number(e.target.value) || 0 })} />
                          {form.param === "JAM_LEMBUR" && <p className="text-[11px] text-gray-400"><T>Contoh kelipatan 4, syarat minimal 4: lembur 4-7 jam = 1x, 8-11 jam = 2x.</T></p>}</div>
                      )}
                    </div>
                  )}
                  {form.method === "PERSEN" && (
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="space-y-1.5"><Label className="text-xs"><T>Persen (%)</T></Label>
                        <Input type="number" step="0.01" min={0} value={form.rate ?? ""} onChange={(e) => set("rate", numOrNull(e.target.value))} /></div>
                      <div className="space-y-1.5"><Label className="text-xs"><T>Batas bawah (Rp)</T></Label>
                        <Input type="number" min={0} value={form.floorAmount ?? ""} onChange={(e) => set("floorAmount", numOrNull(e.target.value))} /></div>
                      <div className="space-y-1.5"><Label className="text-xs"><T>Batas atas (Rp)</T></Label>
                        <Input type="number" min={0} value={form.capAmount ?? ""} onChange={(e) => set("capAmount", numOrNull(e.target.value))} /></div>
                    </div>
                  )}
                  {form.method === "LEMBUR" && (
                    <div className="space-y-3 text-xs">
                      <div className="flex flex-wrap items-center gap-2"><span className="w-28 text-gray-600"><T>Upah sejam = 1 /</T></span>
                        <Input type="number" className="h-8 w-20" value={p.divisor ?? ""} onChange={(e) => setParam({ divisor: Number(e.target.value) || undefined })} />
                        <span className="text-gray-400"><T>x dasar nilai</T></span></div>
                      <div className="rounded-lg bg-gray-50 p-2.5">
                        <p className="mb-1.5 font-semibold text-gray-600"><T>{tiers.rest ? "Tarif hari kerja" : "Tarif lembur"}</T></p>
                        <TierEditor tiers={tiers.work} onChange={(work) => setParam({ work, rest: tiers.rest })} />
                      </div>
                      <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                        <input type="checkbox" checked={!!tiers.rest} className="h-4 w-4 accent-[var(--color-brand)]"
                          onChange={(e) => setParam({ work: tiers.work, rest: e.target.checked ? defaultRestTiers(workDaysPerWeek) : null })} />
                        <T>Bedakan tarif hari libur</T>
                      </label>
                      {tiers.rest && (
                        <div className="rounded-lg bg-gray-50 p-2.5">
                          <p className="mb-1.5 font-semibold text-gray-600"><T>Tarif hari libur</T></p>
                          <TierEditor tiers={tiers.rest} onChange={(rest) => setParam({ work: tiers.work, rest })} />
                        </div>
                      )}
                    </div>
                  )}
                  {form.method === "THR" && (
                    <div className="space-y-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5"><Label className="text-xs"><T>Berapa kali dasar nilai (bulan upah)</T></Label>
                          <Input type="number" step="0.5" min={0} value={p.months ?? ""} onChange={(e) => setParam({ months: Number(e.target.value) })} /></div>
                        <div className="space-y-1.5"><Label className="text-xs"><T>Masa kerja minimal (bulan)</T></Label>
                          <Input type="number" min={0} value={p.minMonths ?? ""} onChange={(e) => setParam({ minMonths: Number(e.target.value) })} /></div>
                      </div>
                      <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                        <input type="checkbox" checked={p.proportional !== false} className="h-4 w-4 accent-[var(--color-brand)]"
                          onChange={(e) => setParam({ proportional: e.target.checked })} />
                        <T>Proporsional bila masa kerja kurang dari 12 bulan</T>
                      </label>
                      <p className="text-[11px] text-gray-400"><T>Komponen tidak rutin: hanya dihitung bila dicentang saat Proses Gaji.</T></p>
                    </div>
                  )}
                </>
              )}
              <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-700"><b><T>Hasil</T>:</b> {t(describe(form, workDaysPerWeek))}</p>
              {legal && <p className="text-xs text-red-600">{t(legal)}</p>}
            </div>
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            {form.kind === "PENDAPATAN" && !system && form.method !== "THR" && (
              <>
                {check(!!p.prorate, (v) => setParam({ prorate: v }), "Prorata",
                  "Dihitung sebagian bila karyawan masuk, keluar, atau berhenti dapat komponen ini di tengah periode.")}
                {check(!!p.fixedWage, (v) => setParam({ fixedWage: v }), "Termasuk upah tetap",
                  "Ikut jadi dasar upah lembur, THR, dan BPJS (PP 36/2021).")}
              </>
            )}
            {check(form.isActive, (v) => set("isActive", v), "Aktif", "Komponen nonaktif tidak dipakai saat menghitung gaji.")}
          </div>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"><T>{error}</T></p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}><T>Batal</T></Button>
          <Button onClick={save} disabled={pending} className="gap-1.5">{pending && <Loader2 size={15} className="animate-spin" />} <T>Simpan</T></Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
