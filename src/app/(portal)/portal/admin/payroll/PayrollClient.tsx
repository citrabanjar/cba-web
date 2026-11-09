"use client";

import { useMemo, useState, useTransition } from "react";
import { Calculator, CheckCircle2, HandCoins, Landmark, Loader2, Play, Settings2, ShieldCheck, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { T, useT } from "@/components/i18n";
import { parseHours, rupiah, simulate, type PayrollSettings } from "@/lib/payroll";
import { savePayrollSettings } from "./actions";
import RunTab, { type NonRoutine, type Run } from "./RunTab";
import TaxSettings from "./TaxSettings";
import TerSettings from "./TerSettings";
import type { TaxYearConfig, TerVersion } from "@/lib/pph21";
import ComponentsTab, { type Component, type PayEmployee } from "./ComponentsTab";

const select = "h-9 w-full rounded-lg border border-input bg-white px-2 text-sm";


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
        {field("Payroll mingguan mulai hari", "Untuk karyawan dengan jadwal bayar Mingguan (gaji harian).",
          <select value={form.weekStartDay} onChange={(e) => set("weekStartDay", Number(e.target.value))} className={select}>
            {["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"].map((d, i) => <option key={d} value={i}>{t(d)}</option>)}
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
  const [v, setV] = useState({
    basic: settings.umk, fixedAllowance: 0, bpjsBase: "", daysPresent: 22, monthsOfService: 12, absentDays: 0, workDaysInMonth: 25,
    tripDays: 0, trips: 0, leaveDays: 0, overtimeWork: "", overtimeRest: "",
  });
  const res = useMemo(() => simulate(components, settings, {
    ...v, bpjsBase: v.bpjsBase === "" ? null : Number(v.bpjsBase), overtimeWork: parseHours(v.overtimeWork), overtimeRest: parseHours(v.overtimeRest),
  }), [components, settings, v]);
  const TEXT = ["bpjsBase", "overtimeWork", "overtimeRest"];
  const n = (k: keyof typeof v, label: string, hint?: string) => (
    <div className="space-y-1.5"><Label className="text-xs"><T>{label}</T></Label>
      <Input type={k === "overtimeWork" || k === "overtimeRest" ? "text" : "number"} min={0} value={v[k]} placeholder={hint}
        onChange={(e) => setV((x) => ({ ...x, [k]: TEXT.includes(k) ? e.target.value : Number(e.target.value) }))} /></div>
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
          {n("basic", "Gaji pokok (Rp)")}{n("fixedAllowance", "Tunjangan upah tetap (Rp)")}
          {n("bpjsBase", "Upah BPJS (Rp, kosong = pokok + tetap)")}{n("monthsOfService", "Masa kerja (bulan) untuk THR")}
          {n("daysPresent", "Hari hadir")}{n("workDaysInMonth", "Hari kerja sebulan")}
          {n("overtimeWork", "Jam lembur hari kerja (per pengajuan)", "4, 9")}{n("overtimeRest", "Jam lembur hari libur (per pengajuan)", "8")}
          {n("absentDays", "Hari mangkir")}{n("leaveDays", "Hari cuti disetujui")}
          {n("tripDays", "Hari dinas luar")}{n("trips", "Kegiatan dinas luar (kali)")}
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
          <p className="flex justify-between"><T>Total pendapatan (tanpa THR/bonus)</T> <b className="tabular-nums">{rupiah(res.earnings)}</b></p>
          <p className="flex justify-between"><T>Total potongan</T> <b className="tabular-nums text-rose-600">-{rupiah(res.deductions)}</b></p>
          <p className="flex justify-between text-base"><T>Gaji bersih (sebelum PPh 21)</T> <b className="tabular-nums text-emerald-700">{rupiah(res.takeHome)}</b></p>
          <p className="flex justify-between"><T>Biaya perusahaan</T> <b className="tabular-nums">{rupiah(res.employerCost)}</b></p>
        </div>
        <p className="flex items-start gap-1.5 text-[11px] text-gray-400"><Landmark size={12} className="mt-0.5 shrink-0" />
          <T>PPh 21 belum ikut disimulasikan. Semua komponen aktif dihitung seolah ditempel; komponen tidak rutin (THR, bonus) tampil tetapi tidak masuk total.</T></p>
      </section>
    </div>
  );
}

export default function PayrollClient({ components, settings, runs, employees, nonRoutine, taxSettings, terSettings }: {
  components: Component[]; settings: PayrollSettings; runs: Run[]; employees: PayEmployee[]; nonRoutine: NonRoutine[];
  taxSettings: Record<string, TaxYearConfig>; terSettings: TerVersion[];
}) {
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
        {tab === "proses" && <RunTab runs={runs} nonRoutine={nonRoutine} weekStartDay={settings.weekStartDay} />}
        {tab === "komponen" && <ComponentsTab components={components} employees={employees} workDaysPerWeek={settings.workDaysPerWeek} />}
        {tab === "pengaturan" && <><SettingsTab settings={settings} /><TaxSettings all={taxSettings} /><TerSettings versions={terSettings} /></>}
        {tab === "simulasi" && <SimulationTab components={components} settings={settings} />}
      </main>
    </div>
  );
}
