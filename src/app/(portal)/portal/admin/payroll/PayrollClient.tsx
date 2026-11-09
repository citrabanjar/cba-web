"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Calculator, CheckCircle2, Coins, FileText, HandCoins, Landmark, Loader2, MinusCircle, Pencil, Play, Plus, Settings2,
  ShieldCheck, Trash2, Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { T, useT } from "@/components/i18n";
import {
  PAY_BASES, PAY_CATEGORIES, PAY_KINDS, PAY_METHODS, baseLabel, categoryLabel, methodLabel, rupiah, simulate,
  type PayComponentInput, type PayrollSettings,
} from "@/lib/payroll";
import { deletePayComponent, savePayComponent, savePayrollSettings } from "./actions";
import RunTab, { type Run } from "./RunTab";

export type Component = Omit<PayComponentInput, "legalBasis" | "note"> & {
  id: string; legalBasis: string | null; note: string | null; sortOrder: number; updatedBy: string | null;
};

const EMPTY: PayComponentInput = {
  code: "", name: "", kind: "PENDAPATAN", category: "TUNJANGAN_TETAP", method: "TETAP",
  amount: null, rate: null, base: null, capAmount: null, floorAmount: null, taxable: true, legalBasis: "", note: "", isActive: true,
};

const KIND_TONE: Record<string, { color: string; icon: React.ElementType }> = {
  PENDAPATAN: { color: "#10b981", icon: Coins },
  POTONGAN: { color: "#f43f5e", icon: MinusCircle },
  BENEFIT: { color: "#6366f1", icon: ShieldCheck },
};

const select = "h-9 w-full rounded-lg border border-input bg-white px-2 text-sm";

// Ringkasan nilai komponen, mis. "3,7% x Upah BPJS (maks Rp11.086.300)".
function valueText(c: Pick<Component, "method" | "amount" | "rate" | "base" | "capAmount" | "floorAmount">, t: (s: string) => string) {
  if (c.method === "PERSEN") {
    const extra = [c.floorAmount ? `${t("min")} ${rupiah(c.floorAmount)}` : "", c.capAmount ? `${t("maks")} ${rupiah(c.capAmount)}` : ""].filter(Boolean).join(", ");
    return `${String(c.rate ?? 0).replace(".", ",")}% x ${t(baseLabel(c.base))}${extra ? ` (${extra})` : ""}`;
  }
  if (c.method === "PER_HADIR") return c.amount ? `${rupiah(c.amount)} / ${t("hari hadir")}` : t("Nominal per hari belum diisi");
  return t(methodLabel(c.method));
}

function ComponentDialog({ comp, onClose }: { comp: Component | "new"; onClose: () => void }) {
  const t = useT();
  const [form, setForm] = useState<PayComponentInput>(() => comp === "new" ? EMPTY : {
    ...comp, legalBasis: comp.legalBasis ?? "", note: comp.note ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof PayComponentInput>(k: K, v: PayComponentInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const numOrNull = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));

  function save() {
    setError(null);
    start(async () => {
      const r = await savePayComponent(comp === "new" ? null : comp.id, form);
      if (r.error) setError(r.error);
      else onClose();
    });
  }

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
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5"><Label className="text-xs"><T>Jenis</T></Label>
              <select value={form.kind} onChange={(e) => set("kind", e.target.value)} className={select}>
                {PAY_KINDS.map((k) => <option key={k.key} value={k.key}>{t(k.label)}</option>)}
              </select></div>
            <div className="space-y-1.5"><Label className="text-xs"><T>Kategori</T></Label>
              <select value={form.category} onChange={(e) => set("category", e.target.value)} className={select}>
                {PAY_CATEGORIES.map((k) => <option key={k.key} value={k.key}>{t(k.label)}</option>)}
              </select></div>
            <div className="space-y-1.5"><Label className="text-xs"><T>Cara hitung</T></Label>
              <select value={form.method} onChange={(e) => set("method", e.target.value)} className={select}>
                {PAY_METHODS.map((k) => <option key={k.key} value={k.key}>{t(k.label)}</option>)}
              </select></div>
          </div>

          {(form.method === "PER_HADIR" || form.method === "TETAP") && (
            <div className="space-y-1.5 sm:w-1/2"><Label className="text-xs">
              <T>{form.method === "PER_HADIR" ? "Nominal per hari hadir (Rp)" : "Nominal bawaan (Rp, opsional)"}</T></Label>
              <Input type="number" min={0} value={form.amount ?? ""} onChange={(e) => set("amount", numOrNull(e.target.value))} /></div>
          )}
          {form.method === "PERSEN" && (
            <div className="grid gap-3 rounded-xl bg-gray-50 p-3 sm:grid-cols-4">
              <div className="space-y-1.5"><Label className="text-xs"><T>Persen (%)</T></Label>
                <Input type="number" step="0.01" min={0} value={form.rate ?? ""} onChange={(e) => set("rate", numOrNull(e.target.value))} /></div>
              <div className="space-y-1.5"><Label className="text-xs"><T>Dasar</T></Label>
                <select value={form.base ?? ""} onChange={(e) => set("base", e.target.value || null)} className={select}>
                  <option value="">—</option>
                  {PAY_BASES.map((k) => <option key={k.key} value={k.key}>{t(k.label)}</option>)}
                </select></div>
              <div className="space-y-1.5"><Label className="text-xs"><T>Batas bawah (Rp)</T></Label>
                <Input type="number" min={0} value={form.floorAmount ?? ""} onChange={(e) => set("floorAmount", numOrNull(e.target.value))} /></div>
              <div className="space-y-1.5"><Label className="text-xs"><T>Batas atas (Rp)</T></Label>
                <Input type="number" min={0} value={form.capAmount ?? ""} onChange={(e) => set("capAmount", numOrNull(e.target.value))} /></div>
            </div>
          )}

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

function ComponentsTab({ components }: { components: Component[] }) {
  const t = useT();
  const [editing, setEditing] = useState<Component | "new" | null>(null);
  const [pending, start] = useTransition();
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
          <p className="text-xs text-gray-400"><T>Pendapatan, potongan, dan benefit yang ditanggung perusahaan, lengkap dengan cara hitung dan dasar hukumnya.</T></p>
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
                        <p className="text-xs text-gray-500"><T>{categoryLabel(c.category)}</T>{!c.isActive && <> · <T>Nonaktif</T></>}</p>
                      </div>
                      <button type="button" onClick={() => setEditing(c)} aria-label={t("Ubah")} className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-brand"><Pencil size={14} /></button>
                      <button type="button" onClick={() => remove(c)} disabled={pending} aria-label={t("Hapus")} className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-brand disabled:opacity-30"><Trash2 size={14} /></button>
                    </div>
                    <p className="mt-3 text-sm font-semibold text-gray-900">{valueText(c, t)}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${c.taxable ? "bg-amber-50 text-amber-700" : "bg-gray-100 text-gray-500"}`}>
                        <T>{c.taxable ? "Objek PPh 21" : "Bukan objek PPh 21"}</T>
                      </span>
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
      {editing && <ComponentDialog comp={editing} onClose={() => setEditing(null)} />}
    </section>
  );
}

function SettingsTab({ settings }: { settings: PayrollSettings }) {
  const t = useT();
  const [form, setForm] = useState<PayrollSettings>(settings);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof PayrollSettings>(k: K, v: PayrollSettings[K]) => { setMsg(null); setForm((f) => ({ ...f, [k]: v })); };
  function save() {
    start(async () => {
      const r = await savePayrollSettings(form);
      setMsg(r.error ? { ok: false, text: r.error } : { ok: true, text: "Pengaturan tersimpan." });
    });
  }
  const field = (label: string, hint: string, node: React.ReactNode) => (
    <div className="space-y-1.5"><Label className="text-xs"><T>{label}</T></Label>{node}<p className="text-[11px] text-gray-400"><T>{hint}</T></p></div>
  );
  return (
    <section className="rounded-2xl border border-gray-200 bg-white">
      <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-ink to-slate-500 text-white"><Settings2 size={17} /></span>
        <div>
          <h3 className="font-semibold text-gray-900"><T>Pengaturan Payroll</T></h3>
          <p className="text-xs text-gray-400"><T>Upah minimum, periode gaji, dan aturan hitung yang berlaku untuk semua karyawan.</T></p>
        </div>
      </div>
      <div className="grid gap-5 p-5 md:grid-cols-3">
        {field("Wilayah upah minimum", "Lokasi kerja yang menjadi dasar UMK.", <Input value={form.region} onChange={(e) => set("region", e.target.value)} />)}
        {field("UMK (Rp)", "UMK Kota Banjarmasin 2026: Rp3.855.894 (SK Gubernur Kalsel 2025).", <Input type="number" value={form.umk} onChange={(e) => set("umk", Number(e.target.value))} />)}
        {field("UMP (Rp)", "UMP Kalimantan Selatan 2026: Rp3.725.000.", <Input type="number" value={form.ump} onChange={(e) => set("ump", Number(e.target.value))} />)}
        {field("Periode gaji mulai tanggal", "1 = sebulan penuh (1 s/d akhir bulan). Isi mis. 21 bila periode 21 s/d 20 bulan berikutnya.",
          <Input type="number" min={1} max={28} value={form.periodStartDay} onChange={(e) => set("periodStartDay", Number(e.target.value))} />)}
        {field("Tanggal gajian", "0 = hari kerja terakhir bulan itu.", <Input type="number" min={0} max={31} value={form.payDay} onChange={(e) => set("payDay", Number(e.target.value))} />)}
        {field("Pembagi upah sejam lembur", "PP 35/2021: 1/173 x upah sebulan.", <Input type="number" value={form.overtimeDivisor} onChange={(e) => set("overtimeDivisor", Number(e.target.value))} />)}
        {field("Hari kerja per minggu (untuk lembur hari libur)", "Menentukan pengali lembur di hari istirahat.",
          <select value={form.workDaysPerWeek} onChange={(e) => set("workDaysPerWeek", Number(e.target.value) === 5 ? 5 : 6)} className={select}>
            <option value={6}>{t("6 hari kerja")}</option><option value={5}>{t("5 hari kerja")}</option>
          </select>)}
        {field("Gaji masuk/keluar di tengah periode", "Cara menghitung gaji prorata.",
          <select value={form.prorate} onChange={(e) => set("prorate", e.target.value === "HARI_KALENDER" ? "HARI_KALENDER" : "HARI_KERJA")} className={select}>
            <option value="HARI_KERJA">{t("Per hari kerja")}</option><option value="HARI_KALENDER">{t("Per hari kalender")}</option>
          </select>)}
        {field("Pembulatan", "Pembulatan nominal setiap komponen.",
          <select value={form.rounding} onChange={(e) => set("rounding", Number(e.target.value))} className={select}>
            <option value={1}>{t("Tanpa pembulatan (Rp1)")}</option><option value={100}>Rp100</option><option value={1000}>Rp1.000</option>
          </select>)}
      </div>
      <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-5 py-3">
        {msg && <span className={`flex items-center gap-1.5 text-sm ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>{msg.ok && <CheckCircle2 size={14} />}<T>{msg.text}</T></span>}
        <Button onClick={save} disabled={pending} className="gap-1.5">{pending && <Loader2 size={15} className="animate-spin" />} <T>Simpan Pengaturan</T></Button>
      </div>
    </section>
  );
}

function SimulationTab({ components, settings }: { components: Component[]; settings: PayrollSettings }) {
  const t = useT();
  const [v, setV] = useState({ basic: settings.umk, fixedAllowance: 0, bpjsBase: "", daysPresent: 22, overtimeHours: 0, restDayOvertimeHours: 0, monthsOfService: 12, absentDays: 0, workDaysInMonth: 25 });
  const res = useMemo(() => simulate(components, settings, { ...v, bpjsBase: v.bpjsBase === "" ? null : Number(v.bpjsBase) }), [components, settings, v]);
  const n = (k: keyof typeof v, label: string) => (
    <div className="space-y-1.5"><Label className="text-xs"><T>{label}</T></Label>
      <Input type="number" min={0} value={v[k]} onChange={(e) => setV((x) => ({ ...x, [k]: k === "bpjsBase" ? e.target.value : Number(e.target.value) }))} /></div>
  );
  const group = (kind: string, title: string) => {
    const lines = res.lines.filter((l) => l.kind === kind);
    if (!lines.length) return null;
    return (
      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400"><T>{title}</T></p>
        <ul className="divide-y divide-gray-50 text-sm">
          {lines.map((l) => (
            <li key={l.code} className="flex items-center gap-3 py-1.5">
              <span className="w-12 shrink-0 text-[11px] font-bold text-gray-400">{l.code}</span>
              <span className="min-w-0 flex-1"><span className="block text-gray-800">{t(l.name)}</span><span className="block text-[11px] text-gray-400">{l.detail}</span></span>
              <span className="shrink-0 font-semibold tabular-nums text-gray-900">{rupiah(l.amount)}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  };
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <section className="rounded-2xl border border-gray-200 bg-white p-5">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-400 text-white"><Calculator size={17} /></span>
          <div><h3 className="font-semibold text-gray-900"><T>Simulasi Gaji</T></h3>
            <p className="text-xs text-gray-400"><T>Coba hitung satu karyawan dengan komponen dan pengaturan di atas.</T></p></div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {n("basic", "Gaji pokok (Rp)")}{n("fixedAllowance", "Tunjangan tetap (Rp)")}
          {n("bpjsBase", "Upah BPJS (Rp, kosong = pokok + tetap)")}{n("monthsOfService", "Masa kerja (bulan) untuk THR")}
          {n("daysPresent", "Hari hadir")}{n("workDaysInMonth", "Hari kerja sebulan")}
          {n("overtimeHours", "Jam lembur hari kerja")}{n("restDayOvertimeHours", "Jam lembur hari libur")}
          {n("absentDays", "Hari mangkir")}
        </div>
        {v.basic + v.fixedAllowance < settings.umk && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700"><T>Upah di bawah UMK</T> {rupiah(settings.umk)}.</p>
        )}
      </section>
      <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5">
        {group("PENDAPATAN", "Pendapatan")}
        {group("POTONGAN", "Potongan")}
        {group("BENEFIT", "Benefit ditanggung perusahaan")}
        <div className="grid gap-2 rounded-xl bg-gray-50 p-3 text-sm sm:grid-cols-2">
          <p className="flex justify-between"><T>Total pendapatan (tanpa THR)</T> <b className="tabular-nums">{rupiah(res.earnings)}</b></p>
          <p className="flex justify-between"><T>Total potongan</T> <b className="tabular-nums text-rose-600">-{rupiah(res.deductions)}</b></p>
          <p className="flex justify-between text-base"><T>Gaji bersih (sebelum PPh 21)</T> <b className="tabular-nums text-emerald-700">{rupiah(res.takeHome)}</b></p>
          <p className="flex justify-between"><T>Biaya perusahaan</T> <b className="tabular-nums">{rupiah(res.employerCost)}</b></p>
        </div>
        <p className="flex items-start gap-1.5 text-[11px] text-gray-400"><Landmark size={12} className="mt-0.5 shrink-0" />
          <T>PPh 21 (TER), bonus, dan kasbon belum ikut disimulasikan.</T></p>
      </section>
    </div>
  );
}

export default function PayrollClient({ components, settings, runs }: { components: Component[]; settings: PayrollSettings; runs: Run[] }) {
  const [tab, setTab] = useState<"proses" | "komponen" | "pengaturan" | "simulasi">("proses");
  const active = components.filter((c) => c.isActive);
  const bpjsEmployer = active.filter((c) => c.kind === "BENEFIT" && c.method === "PERSEN").reduce((a, c) => a + (c.rate ?? 0), 0);
  const bpjsEmployee = active.filter((c) => c.kind === "POTONGAN" && c.method === "PERSEN").reduce((a, c) => a + (c.rate ?? 0), 0);
  const stats = [
    { label: "UMK", value: rupiah(settings.umk), icon: Landmark, tone: "from-brand to-rose-400" },
    { label: "Komponen Aktif", value: String(active.length), icon: Wallet, tone: "from-emerald-500 to-teal-400" },
    { label: "BPJS Perusahaan", value: `${bpjsEmployer.toFixed(2).replace(".", ",")}%`, icon: ShieldCheck, tone: "from-indigo-500 to-violet-400" },
    { label: "BPJS Karyawan", value: `${bpjsEmployee.toFixed(2).replace(".", ",")}%`, icon: HandCoins, tone: "from-amber-500 to-orange-400" },
  ];
  return (
    <div className="bg-gray-50 min-h-full">
      <div className="bg-white border-b border-gray-100 px-6 py-4">
        <h2 className="font-bold text-gray-800"><T>Payroll & Benefit</T></h2>
        <p className="text-xs text-gray-400 mt-0.5"><T>Komponen gaji, BPJS, lembur, THR, dan pengaturan payroll. Isi awal mengikuti aturan yang berlaku; sesuaikan dengan kebijakan perusahaan.</T></p>
      </div>
      <main className="px-4 sm:px-6 py-5 max-w-6xl space-y-5">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="bg-white rounded-2xl border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-gray-500"><T>{s.label}</T></p>
                <span className={`flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br text-white ${s.tone}`}><s.icon size={15} /></span>
              </div>
              <p className="mt-2 text-2xl font-bold tracking-tight text-gray-900">{s.value}</p>
            </div>
          ))}
        </div>
        <div className="flex gap-1 rounded-2xl border border-gray-200 bg-white p-2">
          {([["proses", "Proses Gaji", Play], ["komponen", "Komponen", Wallet], ["pengaturan", "Pengaturan", Settings2], ["simulasi", "Simulasi", Calculator]] as const).map(([k, label, Icon]) => (
            <button key={k} type="button" onClick={() => setTab(k)}
              className={`inline-flex h-9 items-center gap-2 rounded-full px-4 text-sm ${tab === k ? "bg-ink font-semibold text-white shadow-sm" : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"}`}>
              <Icon size={15} /> <T>{label}</T>
            </button>
          ))}
        </div>
        {tab === "proses" && <RunTab runs={runs} />}
        {tab === "komponen" && <ComponentsTab components={components} />}
        {tab === "pengaturan" && <SettingsTab settings={settings} />}
        {tab === "simulasi" && <SimulationTab components={components} settings={settings} />}
      </main>
    </div>
  );
}
