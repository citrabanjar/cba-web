"use client";

import { useState, useTransition } from "react";
import BonusSchedule from "./BonusSchedule";
import type { BonusEntry } from "@/lib/payroll-bonus";
import { CalendarClock, History, CheckCircle2, ChevronRight, Loader2, Percent, Play, Receipt, Settings2, Wallet, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { T, useT } from "@/components/i18n";
import { useCanEdit } from "@/components/portal/edit-access";
import type { PayrollSettings } from "@/lib/payroll";
import { savePayrollSettings } from "./actions";
import { proposedText } from "@/lib/approval-text";
import RunTab, { type NonRoutine, type Run } from "./RunTab";
import RiwayatTab from "./RiwayatTab";
import TaxSettings from "./TaxSettings";
import TerSettings from "./TerSettings";
import ReimburseSettings from "./ReimburseSettings";
import type { ReimburseSettings as ReimburseValue } from "@/lib/reimburse-shared";
import type { TaxYearConfig, TerVersion } from "@/lib/pph21";
import ComponentsTab, { type Component, type PayEmployee } from "./ComponentsTab";
import { showNotice } from "@/components/portal/Confirm";

const select = "h-9 w-full rounded-lg border border-input bg-white px-2 text-sm";


function SettingsTab({ settings }: { settings: PayrollSettings }) {
  const t = useT();
  const canEdit = useCanEdit(); // hak lihat saja: isian dikunci, tombol simpan disembunyikan
  const [form, setForm] = useState<PayrollSettings>(settings);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof PayrollSettings>(k: K, v: PayrollSettings[K]) => { setMsg(null); setForm((f) => ({ ...f, [k]: v })); };
  function save() {
    start(async () => {
      const r = await savePayrollSettings(form);
      if (r.proposed) showNotice(proposedText(r.proposed));
      setMsg(r.error ? { ok: false, text: r.error } : { ok: true, text: r.proposed ? proposedText(r.proposed) : "Pengaturan tersimpan." });
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
          <p className="text-xs text-gray-400"><T>Periode gaji, tanggal gajian, dan aturan hitung yang berlaku untuk semua karyawan.</T></p>
        </div>
      </div>
      <fieldset disabled={!canEdit} className="min-w-0 grid gap-5 p-5 md:grid-cols-3">
        {field("Periode gaji mulai tanggal", "1 = sebulan penuh (1 s/d akhir bulan). Isi mis. 21 bila periode 21 s/d 20 bulan berikutnya.",
          <Input type="number" min={1} max={28} value={form.periodStartDay} onChange={(e) => set("periodStartDay", Number(e.target.value))} />)}
        {field("Tanggal gajian", "0 = hari kerja terakhir bulan itu.", <Input type="number" min={0} max={31} value={form.payDay} onChange={(e) => set("payDay", Number(e.target.value))} />)}
        {field("Pembagi upah sejam lembur", "PP 35/2021: 1/173 x upah sebulan.", <Input type="number" value={form.overtimeDivisor} onChange={(e) => set("overtimeDivisor", Number(e.target.value))} />)}
        {field("Payroll mingguan mulai hari", "Untuk karyawan dengan jadwal bayar Mingguan (gaji harian).",
          <select value={form.weekStartDay} onChange={(e) => set("weekStartDay", Number(e.target.value))} className={select}>
            {["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"].map((d, i) => <option key={d} value={i}>{t(d)}</option>)}
          </select>)}
        {field("Pembulatan", "Pembulatan nominal setiap komponen.",
          <select value={form.rounding} onChange={(e) => set("rounding", Number(e.target.value))} className={select}>
            <option value={1}>{t("Tanpa pembulatan (Rp1)")}</option><option value={100}>Rp100</option><option value={1000}>Rp1.000</option>
          </select>)}
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 md:col-span-3"><T>Identitas pemotong (bukti potong 1721-A1)</T></p>
        {field("Nama pemotong", "Nama perusahaan di bukti potong.", <Input value={form.companyName} onChange={(e) => set("companyName", e.target.value)} />)}
        {field("NPWP pemotong", "NPWP perusahaan (15/16 digit).", <Input value={form.companyNpwp} onChange={(e) => set("companyNpwp", e.target.value)} />)}
        {field("Nama penandatangan", "Pejabat yang menandatangani bukti potong.", <Input value={form.signerName} onChange={(e) => set("signerName", e.target.value)} />)}
        {field("NPWP/NIK penandatangan", "Identitas penandatangan bukti potong.", <Input value={form.signerId} onChange={(e) => set("signerId", e.target.value)} />)}
      </fieldset>
      {canEdit && <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-5 py-3">
        {msg && <span className={`flex items-center gap-1.5 text-sm ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>{msg.ok && <CheckCircle2 size={14} />}<T>{msg.text}</T></span>}
        <Button onClick={save} disabled={pending} className="gap-1.5">{pending && <Loader2 size={15} className="animate-spin" />} <T>Simpan Pengaturan</T></Button>
      </div>}
    </section>
  );
}

// Bagian tab Pengaturan Payroll (menu kiri).
const SETTING_SECTIONS = [
  { key: "payroll", label: "Pengaturan Payroll", Icon: Settings2 },
  { key: "thr", label: "Jadwal THR / Bonus", Icon: CalendarClock },
  { key: "pph", label: "Pengaturan PPh 21", Icon: Receipt },
  { key: "ter", label: "Tarif TER PPh 21", Icon: Percent },
  { key: "reimburse", label: "Reimbursement Pengobatan", Icon: Stethoscope },
] as const;

export default function PayrollClient({ components, settings, runs, employees, nonRoutine, bonus, taxSettings, terSettings, reimburse, revisions }: {
  components: Component[]; settings: PayrollSettings; runs: Run[]; employees: PayEmployee[]; nonRoutine: NonRoutine[]; bonus: BonusEntry[];
  taxSettings: Record<string, TaxYearConfig>; terSettings: TerVersion[]; reimburse: ReimburseValue; revisions?: React.ReactNode;
}) {
  const [tab, setTab] = useState<"proses" | "riwayat" | "komponen" | "pengaturan">("komponen");
  const [focus, setFocus] = useState<string | null>(null); // periode yang dibuka dari Riwayat
  const [setting, setSetting] = useState<(typeof SETTING_SECTIONS)[number]["key"]>("payroll");
  return (
    <div className="bg-gray-50 min-h-full">
      <div className="bg-white border-b border-gray-100 px-6 py-4">
        <h2 className="font-bold text-gray-800"><T>Payroll & Benefit</T></h2>
        <p className="text-xs text-gray-400 mt-0.5"><T>Tata kelola komponen gaji, BPJS, lembur, THR, dan pengaturan payroll yang mengacu pada ketentuan peraturan perundang-undangan, serta disesuaikan dengan kebijakan perusahaan.</T></p>
      </div>
      <main className="px-4 sm:px-6 py-5 max-w-6xl space-y-5">
        {revisions}
        {/* Tab bergaya garis bawah langsung di atas latar portal (tanpa kotak). */}
        <nav className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-white/15 [scrollbar-width:none]">
          {([["pengaturan", "Pengaturan", Settings2], ["komponen", "Komponen", Wallet], ["proses", "Proses Gaji", Play], ["riwayat", "Riwayat", History]] as const).map(([k, label, Icon]) => (
            <button key={k} type="button" onClick={() => setTab(k)}
              className={`relative inline-flex h-11 shrink-0 items-center gap-2 px-3 text-sm transition-colors ${tab === k ? "font-semibold text-white" : "text-white/60 hover:text-white"}`}>
              <Icon size={15} /> <T>{label}</T>
              {tab === k && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-white" />}
            </button>
          ))}
        </nav>
        {tab === "riwayat" && <RiwayatTab runs={runs} onOpen={(p) => { setFocus(p); setTab("proses"); }} />}
        {tab === "proses" && <RunTab key={focus ?? "-"} initialPeriod={focus ?? undefined} runs={runs} bonus={bonus} weekStartDay={settings.weekStartDay}
          fixedCodes={components.filter((c) => ["INPUT", "NOMINAL", "PERSEN", "PPH21"].includes(c.method)).map((c) => c.code)} />}
        {tab === "komponen" && <ComponentsTab components={components} employees={employees} workDaysPerWeek={6} />}
        {tab === "pengaturan" && (
          // Menu di kiri, isi pengaturan terpilih di kanan (seperti halaman Organisasi / Notifikasi).
          <div className="grid gap-4 md:grid-cols-[15rem_1fr]">
            <nav className="h-fit overflow-hidden rounded-2xl border border-gray-200 bg-white">
              {SETTING_SECTIONS.map(({ key, label, Icon }) => {
                const on = key === setting;
                return (
                  <button key={key} type="button" onClick={() => setSetting(key)}
                    className={`flex w-full items-center gap-3 border-b border-gray-100 px-4 py-3 text-left last:border-b-0 ${on ? "bg-brand/10" : "hover:bg-gray-50"}`}>
                    <Icon size={18} className={on ? "text-brand" : "text-gray-400"} />
                    <span className={`flex-1 text-sm ${on ? "font-semibold text-brand" : "text-gray-700"}`}><T>{label}</T></span>
                    <ChevronRight size={14} className={on ? "text-brand" : "text-gray-300"} />
                  </button>
                );
              })}
            </nav>
            <div className="min-w-0">
              {setting === "payroll" && <SettingsTab settings={settings} />}
              {setting === "thr" && <BonusSchedule entries={bonus} components={nonRoutine} />}
              {setting === "pph" && <TaxSettings all={taxSettings} />}
              {setting === "ter" && <TerSettings versions={terSettings} />}
              {setting === "reimburse" && <ReimburseSettings settings={reimburse} />}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
