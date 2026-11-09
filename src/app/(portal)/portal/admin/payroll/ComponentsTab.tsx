"use client";

import { useMemo, useState, useTransition } from "react";
import { Coins, FileText, Loader2, MinusCircle, Pencil, Plus, Search, ShieldCheck, Trash2, UserPlus, Users, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { T, useT } from "@/components/i18n";
import {
  NEEDS_BASE, NEEDS_PARAM, PAY_BASES, PAY_CATEGORIES, PAY_KINDS, PAY_METHODS, PAY_PARAMS, categoryLabel, describe, legalWarning, paramUnit,
  type PayComponentInput, type PayParams,
} from "@/lib/payroll";
import { deletePayComponent, savePayComponent, setComponentAssignments } from "./actions";

export type Component = Omit<PayComponentInput, "legalBasis" | "note"> & {
  id: string; legalBasis: string | null; note: string | null; sortOrder: number; updatedBy: string | null; employeeIds: string[];
};
export type PayEmployee = { id: string; name: string; employeeId: string; department: string | null };

const EMPTY: PayComponentInput = {
  code: "", name: "", kind: "PENDAPATAN", category: "TUNJANGAN_TIDAK_TETAP", method: "INPUT", param: null,
  amount: null, rate: null, base: null, capAmount: null, floorAmount: null, params: null, baseCodes: [], taxable: true, legalBasis: "", note: "", isActive: true,
};

const KIND_TONE: Record<string, { color: string; icon: React.ElementType }> = {
  PENDAPATAN: { color: "#10b981", icon: Coins },
  POTONGAN: { color: "#f43f5e", icon: MinusCircle },
  BENEFIT: { color: "#6366f1", icon: ShieldCheck },
};
const select = "h-9 w-full rounded-lg border border-input bg-white px-2 text-sm";
const RUMUS = PAY_METHODS.filter((m) => m.key !== "INPUT");

function ComponentDialog({ comp, all, onClose, onCreated }: { comp: Component | "new"; all: Component[]; onClose: () => void; onCreated: (id: string) => void }) {
  const t = useT();
  const [form, setForm] = useState<PayComponentInput>(() => (comp === "new" ? EMPTY : { ...comp, legalBasis: comp.legalBasis ?? "", note: comp.note ?? "" }));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof PayComponentInput>(k: K, v: PayComponentInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const numOrNull = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));
  const setParam = (k: keyof PayParams, v: unknown) => setForm((f) => ({ ...f, params: { ...(f.params ?? {}), [k]: v } }));
  const setParamAt = (k: "workday" | "rest6" | "rest5", i: number, len: number, v: string) =>
    setForm((f) => {
      const arr = [...((f.params?.[k] as number[] | undefined) ?? Array(len).fill(0))];
      arr[i] = Number(v.replace(",", ".")) || 0;
      return { ...f, params: { ...(f.params ?? {}), [k]: arr } };
    });
  const isInput = form.method === "INPUT";
  const method = PAY_METHODS.find((m) => m.key === form.method);
  const unit = paramUnit(form.param);
  const legal = legalWarning(form);
  // Komponen yang bisa dicentang sebagai dasar nilai: gaji pokok + pendapatan bernilai tetap.
  const baseOptions = [
    { code: "GP", name: "Gaji Pokok" },
    ...all.filter((c) => c.kind === "PENDAPATAN" && c.code !== "GP" && c.code !== form.code && (c.method === "INPUT" || c.method === "NOMINAL") && c.category !== "GAJI_POKOK"),
  ];

  function chooseMode(mode: "INPUT" | "RUMUS") {
    if (mode === "INPUT") setForm((f) => ({ ...f, method: "INPUT", param: null }));
    else if (isInput) setForm((f) => ({ ...f, method: "PER_SATUAN", param: f.param ?? "HARI_HADIR" }));
  }
  function chooseMethod(m: string) {
    setForm((f) => ({
      ...f, method: m,
      param: NEEDS_PARAM.includes(m) ? f.param ?? (m === "KELIPATAN" ? "JAM_LEMBUR" : m === "PRORATA" ? "HARI_MANGKIR" : "HARI_HADIR") : m === "LEMBUR" ? "JAM_LEMBUR" : m === "THR" ? "MASA_KERJA" : null,
      base: NEEDS_BASE.includes(m) ? f.base ?? "UPAH_TETAP" : null,
      params: m === "LEMBUR" ? { divisor: 173, workday: [1.5, 2], rest6: [2, 3, 4], rest5: [2, 3, 4], ...(f.params ?? {}) } : m === "THR" ? { months: 1, ...(f.params ?? {}) } : f.params,
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
  return (
    <Dialog open onOpenChange={(o: boolean) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle><T>{comp === "new" ? "Tambah Komponen" : "Ubah Komponen"}</T></DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[110px_1fr]">
            <div className="space-y-1.5"><Label className="text-xs"><T>Kode</T></Label>
              <Input value={form.code} maxLength={8} onChange={(e) => set("code", e.target.value.toUpperCase())} /></div>
            <div className="space-y-1.5"><Label className="text-xs"><T>Nama</T></Label>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} /></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label className="text-xs"><T>Jenis</T></Label>
              <select value={form.kind} onChange={(e) => set("kind", e.target.value)} className={select}>
                {PAY_KINDS.map((k) => <option key={k.key} value={k.key}>{t(k.label)}</option>)}
              </select></div>
            <div className="space-y-1.5"><Label className="text-xs"><T>Kategori</T></Label>
              <select value={form.category} onChange={(e) => set("category", e.target.value)} className={select}>
                {PAY_CATEGORIES.map((k) => <option key={k.key} value={k.key}>{t(k.label)}</option>)}
              </select></div>
          </div>

          <div className="space-y-3 rounded-xl border border-gray-200 p-3">
            <p className="text-xs font-semibold text-gray-600"><T>Nilai komponen</T></p>
            <div className="flex gap-1 rounded-xl bg-gray-50 p-1">
              <button type="button" className={tab(isInput)} onClick={() => chooseMode("INPUT")}>
                <b><T>Input</T></b><span className="block text-[11px] opacity-75"><T>Nilainya diisi admin</T></span>
              </button>
              <button type="button" className={tab(!isInput)} onClick={() => chooseMode("RUMUS")}>
                <b><T>Rumus</T></b><span className="block text-[11px] opacity-75"><T>Dihitung dari parameter data</T></span>
              </button>
            </div>

            {isInput ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {([[false, "Tetap per karyawan", "Diisi di profil karyawan (tab Gaji). Contoh: gaji pokok, tunjangan jabatan."],
                  [true, "Diisi tiap periode", "Diisi di Proses Gaji setiap bulan. Contoh: bonus, kasbon."]] as const).map(([pp, label, hint]) => (
                  <label key={label} className={`flex cursor-pointer items-start gap-2 rounded-xl border px-3 py-2 ${!!form.params?.perPeriod === pp ? "border-ink bg-gray-50" : "border-gray-200"}`}>
                    <input type="radio" checked={!!form.params?.perPeriod === pp} onChange={() => setParam("perPeriod", pp)} className="mt-1 accent-[var(--color-brand)]" />
                    <span><span className="block text-sm font-medium text-gray-800"><T>{label}</T></span><span className="block text-[11px] text-gray-400"><T>{hint}</T></span></span>
                  </label>
                ))}
              </div>
            ) : (
              <>
                <div className="space-y-1.5"><Label className="text-xs"><T>Cara hitung</T></Label>
                  <select value={form.method} onChange={(e) => chooseMethod(e.target.value)} className={select}>
                    {RUMUS.map((k) => <option key={k.key} value={k.key}>{t(k.label)}</option>)}
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

                {["NOMINAL", "PER_SATUAN", "KELIPATAN"].includes(form.method) && (
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-1.5"><Label className="text-xs">
                      {form.method === "NOMINAL" ? t("Nominal per bulan (Rp)") : form.method === "PER_SATUAN" ? `${t("Nominal per")} ${t(unit)} (Rp)` : t("Nominal per kelipatan (Rp)")}</Label>
                      <Input type="number" min={0} value={form.amount ?? ""} onChange={(e) => set("amount", numOrNull(e.target.value))} /></div>
                    {form.method === "KELIPATAN" && (
                      <>
                        <div className="space-y-1.5"><Label className="text-xs">{t("Kelipatan")} ({t(unit)})</Label>
                          <Input type="number" min={0} step="0.5" value={form.rate ?? ""} onChange={(e) => set("rate", numOrNull(e.target.value))} /></div>
                        <div className="space-y-1.5"><Label className="text-xs">{t("Minimal")} ({t(unit)})</Label>
                          <Input type="number" min={0} step="0.5" value={form.params?.min ?? ""} placeholder={String(form.rate ?? "")}
                            onChange={(e) => setParam("min", numOrNull(e.target.value) ?? undefined)} /></div>
                      </>
                    )}
                  </div>
                )}
                {form.method === "KELIPATAN" && form.param === "JAM_LEMBUR" && (
                  <p className="text-[11px] text-gray-400"><T>Dihitung per pengajuan lembur. Contoh kelipatan 4, minimal 4: lembur 4-7 jam = 1x, 8-11 jam = 2x.</T></p>
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
                  <div className="space-y-2 text-xs">
                    <div className="flex flex-wrap items-center gap-2"><span className="w-44 text-gray-600"><T>Upah sejam = 1 / pembagi</T></span>
                      <Input type="number" className="h-8 w-20" value={form.params?.divisor ?? ""} onChange={(e) => setParam("divisor", Number(e.target.value))} /></div>
                    {([["workday", 2, "Hari kerja: jam ke-1, jam berikutnya"], ["rest6", 3, "Libur (6 hari kerja): jam 1-7, jam ke-8, jam 9-10"], ["rest5", 3, "Libur (5 hari kerja): jam 1-8, jam ke-9, jam 10-11"]] as const).map(([k, len, label]) => (
                      <div key={k} className="flex flex-wrap items-center gap-2"><span className="w-44 text-gray-600"><T>{label}</T></span>
                        {Array.from({ length: len }, (_, i) => (
                          <Input key={i} type="number" step="0.5" className="h-8 w-16" value={(form.params?.[k] as number[] | undefined)?.[i] ?? ""}
                            onChange={(e) => setParamAt(k, i, len, e.target.value)} />
                        ))}<span className="text-gray-400">x</span>
                      </div>
                    ))}
                  </div>
                )}
                {form.method === "THR" && (
                  <div className="space-y-1.5 sm:w-1/2"><Label className="text-xs"><T>Berapa bulan upah (masa kerja 12 bulan atau lebih)</T></Label>
                    <Input type="number" step="0.5" min={0} value={form.params?.months ?? ""} onChange={(e) => setParam("months", Number(e.target.value))} />
                    <p className="text-[11px] text-gray-400"><T>Masa kerja kurang dari 12 bulan otomatis proporsional.</T></p></div>
                )}
              </>
            )}
            <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-700"><b><T>Hasil</T>:</b> {t(describe(form))}</p>
            {legal && <p className="text-xs text-red-600">{t(legal)}</p>}
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-gray-200 px-3 py-2">
              <input type="checkbox" checked={form.taxable} onChange={(e) => set("taxable", e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--color-brand)]" />
              <span><span className="block text-sm font-medium text-gray-800"><T>Objek PPh 21</T></span>
                <span className="block text-[11px] text-gray-400"><T>Ikut dihitung sebagai penghasilan kena pajak.</T></span></span>
            </label>
            <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-gray-200 px-3 py-2">
              <input type="checkbox" checked={form.isActive} onChange={(e) => set("isActive", e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--color-brand)]" />
              <span><span className="block text-sm font-medium text-gray-800"><T>Aktif</T></span>
                <span className="block text-[11px] text-gray-400"><T>Komponen nonaktif tidak dipakai saat menghitung gaji.</T></span></span>
            </label>
          </div>
          <div className="space-y-1.5"><Label className="text-xs"><T>Dasar hukum</T></Label>
            <Input value={form.legalBasis} onChange={(e) => set("legalBasis", e.target.value)} /></div>
          <div className="space-y-1.5"><Label className="text-xs"><T>Catatan / ketentuan perusahaan</T></Label>
            <textarea value={form.note} rows={3} onChange={(e) => set("note", e.target.value)} className="w-full rounded-lg border border-input px-3 py-2 text-sm" /></div>
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

// Tempel komponen ke karyawan (mirip tempel jadwal): centang karyawan yang mendapat komponen ini.
function AssignDialog({ comp, employees, onClose }: { comp: Component; employees: PayEmployee[]; onClose: () => void }) {
  const t = useT();
  const [picked, setPicked] = useState(() => new Set(comp.employeeIds));
  const [q, setQ] = useState("");
  const [dept, setDept] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const depts = useMemo(() => [...new Set(employees.map((e) => e.department).filter(Boolean) as string[])].sort(), [employees]);
  const shown = employees.filter((e) => (!dept || e.department === dept) && (!q || `${e.name} ${e.employeeId}`.toLowerCase().includes(q.toLowerCase())));
  const allShown = shown.length > 0 && shown.every((e) => picked.has(e.id));
  const toggle = (id: string, on: boolean) => setPicked((p) => { const n = new Set(p); if (on) n.add(id); else n.delete(id); return n; });
  function save() {
    setError(null);
    start(async () => {
      const r = await setComponentAssignments(comp.id, [...picked]);
      if (r.error) setError(r.error);
      else onClose();
    });
  }
  return (
    <Dialog open onOpenChange={(o: boolean) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader><DialogTitle><T>Tempel Komponen</T> · {comp.code} {t(comp.name)}</DialogTitle></DialogHeader>
        <p className="-mt-2 text-xs text-gray-500"><T>Hanya karyawan yang dicentang yang mendapat komponen ini saat Proses Gaji.</T></p>
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-40 flex-1">
            <Search size={14} className="absolute left-2.5 top-2.5 text-gray-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Cari nama / ID")} className="pl-8" />
          </div>
          <select value={dept} onChange={(e) => setDept(e.target.value)} className="h-9 rounded-lg border border-input bg-white px-2 text-sm">
            <option value="">{t("Semua departemen")}</option>
            {depts.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div className="flex items-center justify-between text-xs">
          <label className="flex cursor-pointer items-center gap-2 font-medium text-gray-700">
            <input type="checkbox" checked={allShown} onChange={(e) => shown.forEach((x) => toggle(x.id, e.target.checked))} className="h-4 w-4 accent-[var(--color-brand)]" />
            <T>Pilih semua</T> ({shown.length})
          </label>
          <span className="text-gray-500">{picked.size} <T>karyawan dipilih</T></span>
        </div>
        <ul className="max-h-80 divide-y divide-gray-50 overflow-y-auto rounded-xl border border-gray-200">
          {shown.map((e) => (
            <li key={e.id}>
              <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-gray-50">
                <input type="checkbox" checked={picked.has(e.id)} onChange={(x) => toggle(e.id, x.target.checked)} className="h-4 w-4 accent-[var(--color-brand)]" />
                <span className="min-w-0 flex-1"><span className="block text-sm text-gray-900">{e.name}</span>
                  <span className="block text-[11px] text-gray-400">{[e.employeeId, e.department].filter(Boolean).join(" · ")}</span></span>
              </label>
            </li>
          ))}
          {shown.length === 0 && <li className="px-3 py-6 text-center text-sm text-gray-400"><T>Tidak ada karyawan.</T></li>}
        </ul>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"><T>{error}</T></p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}><T>Batal</T></Button>
          <Button onClick={save} disabled={pending} className="gap-1.5">{pending && <Loader2 size={15} className="animate-spin" />} <T>Simpan</T></Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ComponentsTab({ components, employees }: { components: Component[]; employees: PayEmployee[] }) {
  const t = useT();
  const [editing, setEditing] = useState<Component | "new" | null>(null);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const assignComp = components.find((c) => c.id === assigning);
  function remove(c: Component) {
    if (!window.confirm(t("Hapus komponen ini?"))) return;
    start(async () => { await deletePayComponent(c.id); });
  }
  return (
    <section className="rounded-2xl border border-gray-200 bg-white">
      <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 px-5 py-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-rose-400 text-white"><Wallet size={17} /></span>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-gray-900"><T>Komponen Gaji & Benefit</T></h3>
          <p className="text-xs text-gray-400"><T>Setiap komponen menjadi kolom hasil Proses Gaji. Nilainya Input atau Rumus, lalu tempel ke karyawan yang mendapatkannya.</T></p>
        </div>
        <button type="button" onClick={() => setEditing("new")}
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-ink px-4 text-xs font-semibold text-white hover:bg-ink/85">
          <Plus size={14} /> <T>Tambah Komponen</T>
        </button>
      </div>
      {PAY_KINDS.map((k) => {
        const list = components.filter((c) => c.kind === k.key);
        if (list.length === 0) return null;
        const tone = KIND_TONE[k.key];
        return (
          <div key={k.key} className="border-b border-gray-100 p-4 last:border-b-0">
            <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <tone.icon size={14} style={{ color: tone.color }} /> <T>{k.label}</T> <span className="text-gray-300">{list.length}</span>
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              {list.map((c) => (
                <div key={c.id} className={`relative overflow-hidden rounded-2xl border border-gray-200 bg-white ${c.isActive ? "" : "opacity-55"}`}>
                  <span className="absolute inset-y-0 left-0 w-1.5" style={{ background: tone.color }} />
                  <div className="p-4 pl-5">
                    <div className="flex items-start gap-3">
                      <span className="flex h-9 min-w-12 items-center justify-center rounded-xl px-2 text-[11px] font-bold text-white" style={{ background: tone.color }}>{c.code}</span>
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-gray-900">{t(c.name)}</p>
                        <p className="text-xs text-gray-500"><T>{categoryLabel(c.category)}</T> · <T>{c.method === "INPUT" ? "Input" : "Rumus"}</T>{!c.isActive && <> · <T>Nonaktif</T></>}</p>
                      </div>
                      <button type="button" onClick={() => setEditing(c)} aria-label={t("Ubah")} className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-brand"><Pencil size={14} /></button>
                      <button type="button" onClick={() => remove(c)} disabled={pending} aria-label={t("Hapus")} className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-brand disabled:opacity-30"><Trash2 size={14} /></button>
                    </div>
                    <p className="mt-3 text-sm font-semibold text-gray-900">{t(describe(c))}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <button type="button" onClick={() => setAssigning(c.id)}
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${c.employeeIds.length ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100" : "bg-amber-50 text-amber-700 hover:bg-amber-100"}`}>
                        {c.employeeIds.length ? <Users size={12} /> : <UserPlus size={12} />}
                        {c.employeeIds.length ? `${c.employeeIds.length} ${t("karyawan")}` : t("Belum ditempel")} · <T>Tempel</T>
                      </button>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${c.taxable ? "bg-amber-50 text-amber-700" : "bg-gray-100 text-gray-500"}`}>
                        <T>{c.taxable ? "Objek PPh 21" : "Bukan objek PPh 21"}</T>
                      </span>
                      {legalWarning(c) && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-600">{t(legalWarning(c)!)}</span>}
                    </div>
                    {c.note && <p className="mt-2 text-xs leading-relaxed text-gray-500">{t(c.note)}</p>}
                    {c.legalBasis && (
                      <p className="mt-2 flex items-start gap-1.5 border-t border-gray-100 pt-2 text-[11px] text-gray-400"><FileText size={12} className="mt-0.5 shrink-0" /> {c.legalBasis}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
      {editing && <ComponentDialog comp={editing} all={components} onClose={() => setEditing(null)} onCreated={setAssigning} />}
      {assignComp && <AssignDialog key={assignComp.id} comp={assignComp} employees={employees} onClose={() => setAssigning(null)} />}
    </section>
  );
}
