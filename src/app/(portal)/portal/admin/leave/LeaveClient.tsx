"use client";

import { proposedText } from "@/lib/approval-text";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  BadgeCheck, CalendarHeart, ChevronDown, FileClock, ChevronRight, Coins, Loader2, Paperclip, Plus, Scale, Trash2, Users, Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { T, useT } from "@/components/i18n";
import {
  LEAVE_CATEGORIES, LEAVE_PERIODS, LEAVE_RENEWALS, LEAVE_UNITS, categoryLabel, expiryLabel, periodLabel, unitLabel, type LeavePolicyInput,
} from "@/lib/leave";
import { deleteLeavePolicy, saveAbsenceBackDays, saveLeavePolicy } from "./actions";
import BalanceTab from "./BalanceTab";
import { useCanEdit } from "@/components/portal/edit-access";
import type { BalanceRow, LeaveBalanceSwitch } from "@/lib/leave-balance";
import { toast } from "@/components/portal/Toast";
import { askConfirm, showNotice } from "@/components/portal/Confirm";

export type Policy = Omit<LeavePolicyInput, "payNote" | "attachmentNote" | "legalBasis" | "note" | "carryOverExpiry"> & {
  id: string; payNote: string | null; attachmentNote: string | null; legalBasis: string | null; note: string | null; carryOverExpiry: string | null;
  sortOrder: number; updatedBy: string | null; updatedAt: string;
};

const EMPTY: LeavePolicyInput = {
  code: "", name: "", category: "KHUSUS", quota: 1, unit: "HARI_KERJA", period: "KEJADIAN", minServiceMonths: 0,
  gender: null, forStatus: null, accrualPerMonth: 0, paid: true, payNote: "", deductsAnnual: false, needsAttachment: false, attachmentNote: "",
  carryOverDays: 0, noticeDays: 0, legalBasis: "", note: "", isActive: true,
  renewal: "JANUARI", carryOverExpires: false, carryOverExpiry: "", allowHalfDay: false,
};
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

const TONE: Record<string, string> = {
  TAHUNAN: "#10b981", ISTIRAHAT_PANJANG: "#0ea5e9", KHUSUS: "#8b5cf6", MELAHIRKAN: "#ec4899", SAKIT: "#f59e0b",
  IBADAH: "#14b8a6", DINAS: "#6366f1", TANPA_UPAH: "#64748b",
};

// "12 hari kerja per tahun", atau "Sesuai kebutuhan" kalau tanpa batas.
function Quota({ p }: { p: Pick<Policy, "quota" | "unit" | "period"> }) {
  if (p.quota === null) return <T>Sesuai kebutuhan</T>;
  return <>{p.quota} <T>{unitLabel(p.unit)}</T> <T>{periodLabel(p.period)}</T></>;
}

function Chip({ children, tone = "gray" }: { children: React.ReactNode; tone?: "gray" | "green" | "amber" | "rose" | "blue" }) {
  const cls = {
    gray: "bg-gray-100 text-gray-600", green: "bg-emerald-50 text-emerald-700", amber: "bg-amber-50 text-amber-700",
    rose: "bg-rose-50 text-rose-700", blue: "bg-sky-50 text-sky-700",
  }[tone];
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${cls}`}>{children}</span>;
}

// Formulir jenis cuti di panel kanan (seperti Komponen Payroll): Batal / Simpan di atas, tanpa dialog.
function PolicyForm({ policy, onClose, onDirty }: { policy: Policy | "new"; onClose: () => void; onDirty: (d: boolean) => void }) {
  const t = useT();
  const initial = useMemo<LeavePolicyInput>(() => policy === "new" ? EMPTY : {
    ...policy, payNote: policy.payNote ?? "", attachmentNote: policy.attachmentNote ?? "",
    legalBasis: policy.legalBasis ?? "", note: policy.note ?? "", carryOverExpiry: policy.carryOverExpiry ?? "",
  }, [policy]);
  const [form, setForm] = useState<LeavePolicyInput>(initial);
  const [unlimited, setUnlimited] = useState(initial.quota === null);
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  useEffect(() => { onDirty(dirty); }, [dirty, onDirty]);
  const set = <K extends keyof LeavePolicyInput>(k: K, v: LeavePolicyInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const [expMonth, expDay] = (form.carryOverExpiry || "03-31").split("-").map(Number);
  const setExpiry = (m: number, d: number) => set("carryOverExpiry", `${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);

  // Kategori Cuti Tahunan punya dua cara dapat saldo; kategori lain memakai Hak Cuti per kejadian / per tahun biasa.
  const saldo = form.category === "TAHUNAN";
  const monthly = form.accrualPerMonth > 0;

  // Mengganti kategori/cara langsung mengisi nilai bawaan yang masuk akal, seperti form Tambah Komponen.
  function yearlyDefaults(f: LeavePolicyInput): LeavePolicyInput {
    return { ...f, period: "TAHUN", unit: "HARI_KERJA", accrualPerMonth: 0, quota: f.quota && f.quota > 1 ? f.quota : 12, renewal: f.renewal || "JANUARI", forStatus: f.forStatus ?? "TETAP", deductsAnnual: false };
  }
  function monthlyDefaults(f: LeavePolicyInput): LeavePolicyInput {
    return { ...f, period: "KEJADIAN", unit: "HARI_KERJA", accrualPerMonth: f.accrualPerMonth > 0 ? f.accrualPerMonth : 1, quota: null, minServiceMonths: 0, carryOverDays: 0, carryOverExpires: false, forStatus: "KONTRAK", deductsAnnual: false };
  }
  function pickCategory(category: string) {
    if (category === "TAHUNAN") setUnlimited(false);
    setForm((f) => {
      if (category === "TAHUNAN") return yearlyDefaults({ ...f, category });
      const back = f.category === "TAHUNAN" ? { period: "KEJADIAN", accrualPerMonth: 0, allowHalfDay: false } : {};
      return { ...f, ...back, category };
    });
  }
  function pickMode(mode: "TAHUN" | "BULAN") {
    setUnlimited(mode === "BULAN");
    setForm((f) => (mode === "TAHUN" ? { ...yearlyDefaults(f), forStatus: "TETAP" } : monthlyDefaults(f)));
  }

  function save() {
    start(async () => {
      const r = await saveLeavePolicy(policy === "new" ? null : policy.id, { ...form, quota: saldo ? (monthly ? null : form.quota) : unlimited ? null : form.quota });
      if (r.error) { void showNotice(t(r.error), "error"); return; }
      onDirty(false);
      void showNotice(r.proposed ? proposedText(r.proposed) : t("Jenis cuti tersimpan."));
      if (policy === "new") onClose();
    });
  }
  function cancel() {
    if (policy === "new") { onDirty(false); onClose(); return; }
    setForm(initial); setUnlimited(initial.quota === null);
  }

  const select = "h-9 w-full rounded-lg border border-input bg-white px-2 text-sm";
  const tab = (on: boolean) => `flex-1 rounded-lg px-3 py-2 text-left text-sm ${on ? "bg-ink text-white shadow-sm" : "text-gray-600 hover:bg-gray-100"}`;
  const check = (k: "paid" | "deductsAnnual" | "needsAttachment" | "isActive" | "allowHalfDay", label: string, hint?: string) => (
    <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-gray-200 px-3 py-2">
      <input type="checkbox" checked={form[k]} onChange={(e) => set(k, e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--color-brand)]" />
      <span><span className="block text-sm font-medium text-gray-800"><T>{label}</T></span>
        {hint && <span className="block text-[11px] text-gray-400"><T>{hint}</T></span>}</span>
    </label>
  );
  const field = (label: string, input: React.ReactNode, hint?: string) => (
    <div className="space-y-1.5"><Label className="text-xs"><T>{label}</T></Label>{input}
      {hint && <p className="text-[11px] text-gray-400"><T>{hint}</T></p>}</div>
  );
  const num = (k: "quota" | "accrualPerMonth" | "minServiceMonths" | "noticeDays" | "carryOverDays", step = 1) => (
    <Input type="number" min={0} step={step} value={(form[k] as number | null) ?? 0} onChange={(e) => set(k, Number(e.target.value))} />
  );
  const statusSelect = (
    <select value={form.forStatus ?? ""} onChange={(e) => set("forStatus", e.target.value || null)} className={select}>
      <option value="">{t("Semua status")}</option>
      <option value="TETAP">{t("Karyawan tetap")}</option>
      <option value="KONTRAK">{t("Karyawan kontrak")}</option>
    </select>
  );
  const halfDay = check("allowHalfDay", "Boleh setengah hari", "Karyawan bisa mengajukan 0,5 hari: masuk setelah istirahat, atau pulang saat istirahat.");

  return (
    <div>
        <div className="mb-4 flex justify-end gap-2">
          <Button variant="outline" disabled={pending || (policy !== "new" && !dirty)} onClick={cancel}><T>Batal</T></Button>
          <Button onClick={save} disabled={pending || (policy !== "new" && !dirty)} className="gap-1.5">
            {pending && <Loader2 size={15} className="animate-spin" />} <T>Simpan</T>
          </Button>
        </div>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[110px_1fr]">
            <div className="space-y-1.5"><Label className="text-xs"><T>Kode</T></Label>
              <Input value={form.code} maxLength={8} onChange={(e) => set("code", e.target.value.toUpperCase())} /></div>
            <div className="space-y-1.5"><Label className="text-xs"><T>Nama</T></Label>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} /></div>
          </div>
          <div className="space-y-1.5"><Label className="text-xs"><T>Kategori</T></Label>
            <select value={form.category} onChange={(e) => pickCategory(e.target.value)} className={select}>
              {LEAVE_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{t(c.label)}</option>)}
            </select></div>

          {saldo ? (
            <div className="space-y-3 rounded-xl border border-gray-200 p-3">
              <p className="text-xs font-semibold text-gray-600"><T>Cara dapat saldo</T></p>
              <div className="flex gap-1 rounded-xl bg-gray-50 p-1">
                <button type="button" className={tab(!monthly)} onClick={() => pickMode("TAHUN")}>
                  <b><T>Hak Cuti per tahun</T></b><span className="block text-[11px] opacity-75"><T>Cuti Tahunan karyawan tetap</T></span>
                </button>
                <button type="button" className={tab(monthly)} onClick={() => pickMode("BULAN")}>
                  <b><T>Bertambah tiap bulan</T></b><span className="block text-[11px] opacity-75"><T>Cuti Masa Kontrak</T></span>
                </button>
              </div>

              {!monthly ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {field("Hak Cuti per tahun", num("quota"))}
                    {field("Satuan", (
                      <select value={form.unit} onChange={(e) => set("unit", e.target.value)} className={select}>
                        {LEAVE_UNITS.filter((u) => u.key !== "BULAN").map((u) => <option key={u.key} value={u.key}>{t(u.label)}</option>)}
                      </select>))}
                    {field("Hak Cuti diperbarui", (
                      <select value={form.renewal} onChange={(e) => set("renewal", e.target.value)} className={select}>
                        {LEAVE_RENEWALS.map((r) => <option key={r.key} value={r.key}>{t(r.label)}</option>)}
                      </select>))}
                  </div>
                  <p className="text-[11px] text-gray-400"><T>{form.renewal === "JANUARI"
                    ? "Semua karyawan dapat Hak Cuti baru tiap 1 Januari. Saat mulai berhak (mis. diangkat tetap) dapat Hak Cuti prorata sampai Desember."
                    : "Hak Cuti baru masuk di ulang tahun kerja masing-masing karyawan."}</T></p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {field("Masa kerja minimal (bulan)", num("minServiceMonths"), "Hitungan dari tanggal masuk. 0 = langsung berhak.")}
                    {field("Sisa boleh dibawa (maksimal hari)", num("carryOverDays"), "0 = semua sisa hangus saat Hak Cuti baru masuk.")}
                  </div>
                  {form.renewal === "JANUARI" && form.carryOverDays > 0 && (
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                        <input type="checkbox" checked={form.carryOverExpires} className="h-4 w-4 accent-[var(--color-brand)]"
                          onChange={(e) => { set("carryOverExpires", e.target.checked); if (e.target.checked && !form.carryOverExpiry) set("carryOverExpiry", "03-31"); }} />
                        <T>Sisa bawaan ada batas waktu</T>
                      </label>
                      {form.carryOverExpires && (
                        <span className="flex items-center gap-2 text-sm text-gray-600">
                          <T>berlaku s/d</T>
                          <Input type="number" min={1} max={31} value={expDay} onChange={(e) => setExpiry(expMonth, Math.max(1, Math.min(31, Number(e.target.value) || 1)))} className="h-9 w-16" />
                          <select value={expMonth} onChange={(e) => setExpiry(Number(e.target.value), expDay)} className="h-9 rounded-lg border border-input bg-white px-2 text-sm">
                            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                          </select>
                          <T>tahun berikutnya</T>
                        </span>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {field("Bertambah tiap genap 1 bulan kerja (hari)", num("accrualPerMonth", 0.5))}
                  </div>
                  <p className="text-[11px] text-gray-400"><T>Saldo pertama muncul setelah 1 bulan kerja. Berhenti bertambah saat kontrak lewat tanggal akhir dan belum diperpanjang (bulan yang terlewat ditambahkan setelah diperpanjang). Hangus saat karyawan diberhentikan.</T></p>
                </>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                {field("Status kerja", statusSelect)}
                {field("Diajukan paling lambat (hari sebelum)", num("noticeDays"))}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {check("paid", "Upah tetap dibayar")}
                {halfDay}
              </div>
              <p className="text-[11px] text-gray-400"><T>Kalau saldo tidak cukup, kelebihannya otomatis masuk cuti di luar tanggungan.</T></p>
            </div>
          ) : (
            <div className="space-y-3 rounded-xl border border-gray-200 p-3">
              <p className="text-xs font-semibold text-gray-600"><T>Hak Cuti</T></p>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={unlimited} onChange={(e) => setUnlimited(e.target.checked)} className="h-4 w-4 accent-[var(--color-brand)]" />
                <T>Tanpa batas tetap (sesuai kebutuhan / surat dokter)</T>
              </label>
              {!unlimited && (
                <div className="grid gap-3 sm:grid-cols-3">
                  {field("Jumlah", num("quota"))}
                  {field("Satuan", (
                    <select value={form.unit} onChange={(e) => set("unit", e.target.value)} className={select}>
                      {LEAVE_UNITS.map((u) => <option key={u.key} value={u.key}>{t(u.label)}</option>)}
                    </select>))}
                  {field("Berlaku", (
                    <select value={form.period} onChange={(e) => set("period", e.target.value)} className={select}>
                      {LEAVE_PERIODS.map((p) => <option key={p.key} value={p.key}>{t(p.label)}</option>)}
                    </select>))}
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                {field("Status kerja", statusSelect)}
                {field("Berlaku untuk", (
                  <select value={form.gender ?? ""} onChange={(e) => set("gender", e.target.value || null)} className={select}>
                    <option value="">{t("Semua karyawan")}</option>
                    <option value="P">{t("Perempuan")}</option>
                    <option value="L">{t("Laki-laki")}</option>
                  </select>))}
                {field("Masa kerja minimal (bulan)", num("minServiceMonths"))}
                {field("Diajukan paling lambat (hari sebelum)", num("noticeDays"))}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {check("paid", "Upah tetap dibayar")}
                {check("deductsAnnual", "Potong cuti tahunan", "Hari yang diambil mengurangi saldo cuti tahunan.")}
                {check("needsAttachment", "Wajib lampiran")}
              </div>
              {(!form.paid || form.needsAttachment) && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {!form.paid && field("Ketentuan upah", <Input value={form.payNote} placeholder={t("Contoh: Bulan 1-4 upah penuh, bulan 5-6 75%")} onChange={(e) => set("payNote", e.target.value)} />)}
                  {form.needsAttachment && field("Lampiran yang diminta", <Input value={form.attachmentNote} placeholder={t("Contoh: Surat keterangan dokter")} onChange={(e) => set("attachmentNote", e.target.value)} />)}
                </div>
              )}
            </div>
          )}

          {check("isActive", "Aktif", "Jenis nonaktif tidak bisa dipilih saat pengajuan.")}
        </div>
    </div>
  );
}

export type LeaveRequestRow = {
  id: string; name: string; employeeId: string; department: string | null; policy: string; start: string; end: string; days: number;
  reason: string; urgent: boolean; delegate: string | null; createdAt: string; approver: string;
};

export default function LeaveClient({ policies, balances, balanceSwitch, superAdmin, backDays = 3, requests = [], onLeave = [], view, initialTab }: { policies: Policy[]; balances: BalanceRow[]; balanceSwitch: LeaveBalanceSwitch; superAdmin: boolean; backDays?: number; requests?: LeaveRequestRow[]; onLeave?: LeaveRequestRow[]; view?: "pengajuan" | "sedang"; initialTab?: "pengajuan" | "saldo" }) {
  const t = useT();
  const router = useRouter();
  const [tab, setTab] = useState<"jenis" | "saldo" | "pengajuan">(initialTab ?? "jenis");
  const [creating, setCreating] = useState(false); // formulir jenis baru di panel kanan
  const [dirty, setDirty] = useState(false); // ada isian yang belum disimpan
  const [showForm, setShowForm] = useState(false); // formulir ubah di bawah garis: dibuka / disembunyikan
  const [pending, start] = useTransition();
  // Daftar kiri dikelompokkan per kategori; jenis yang dibuka di kanan (bawaan: yang pertama).
  const ordered = [...LEAVE_CATEGORIES.flatMap((c) => policies.filter((p) => p.category === c.key)), ...policies.filter((p) => !LEAVE_CATEGORIES.some((c) => c.key === p.category))];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = ordered.find((p) => p.id === selectedId) ?? ordered[0];
  async function leave(go: () => void) {
    if (dirty && !(await askConfirm(t("Perubahan belum disimpan. Tinggalkan tanpa menyimpan?")))) return;
    setDirty(false);
    go();
  }
  const canEdit = useCanEdit(); // hak lihat saja: tombol ubah disembunyikan

  const active = policies.filter((p) => p.isActive);
  const annual = policies.find((p) => p.code === "CT");
  const stats = [
    { label: "Jenis Aktif", value: active.length, icon: BadgeCheck, tone: "from-brand to-rose-400" },
    { label: "Cuti Tahunan", value: annual?.quota != null ? `${annual.quota} ${t("hari")}` : "—", icon: CalendarHeart, tone: "from-emerald-500 to-teal-400" },
    { label: "Cuti Khusus", value: active.filter((p) => p.category === "KHUSUS").length, icon: Users, tone: "from-violet-500 to-indigo-400" },
    { label: "Tanpa Upah", value: active.filter((p) => !p.paid).length, icon: Coins, tone: "from-slate-500 to-slate-400" },
  ];

  async function remove(p: Policy) {
    if (!await askConfirm(t("Hapus jenis cuti ini?"))) return;
    start(async () => { const r = await deleteLeavePolicy(p.id); if (r.error) toast(r.error, "error"); else if (r.proposed) showNotice(proposedText(r.proposed)); });
  }

  return (
    <div className="bg-gray-50 min-h-full">
      <div className="bg-white border-b border-gray-100 px-6 py-4">
        <h2 className="font-bold text-gray-800"><T>Cuti</T></h2>
        <p className="text-xs text-gray-400 mt-0.5">
          <T>Tata kelola kebijakan cuti, izin, dan dinas luar perusahaan yang mengacu pada Undang-Undang Ketenagakerjaan dan Undang-Undang Kesejahteraan Ibu dan Anak, serta disesuaikan dengan Peraturan Perusahaan.</T>
        </p>
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
          {([["jenis", "Jenis Cuti", Scale], ["saldo", "Saldo Cuti", Wallet], ["pengajuan", "Proses Cuti", FileClock]] as const).map(([k, label, Icon]) => (
            <button key={k} type="button" onClick={() => { setTab(k); if (view) router.replace(k === "pengajuan" ? "/portal/admin/leave?tab=pengajuan" : "/portal/admin/leave"); }}
              className={`inline-flex h-9 items-center gap-2 rounded-full px-4 text-sm ${tab === k ? "bg-ink font-semibold text-white shadow-sm" : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"}`}>
              <Icon size={15} /> <T>{label}</T>
              {k === "pengajuan" && requests.length + onLeave.length > 0 && <span className="text-xs opacity-70">{requests.length + onLeave.length}</span>}
            </button>
          ))}
        </div>

        {tab === "saldo" && <BalanceTab rows={balances} balanceSwitch={balanceSwitch} superAdmin={superAdmin} />}
        {tab === "pengajuan" && <RequestsTab rows={requests} onLeave={onLeave} view={view} />}
        {tab === "jenis" && <AbsenceSetting value={backDays} canEdit={canEdit} />}
        {tab === "jenis" && <section className="rounded-2xl border border-gray-200 bg-white">
          <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 px-5 py-4">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-rose-400 text-white"><Scale size={17} /></span>
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-gray-900"><T>Jenis Cuti & Izin</T></h3>
              <p className="text-xs text-gray-400"><T>Hak Cuti, syarat, dan upah setiap jenis cuti.</T></p>
            </div>
            {canEdit && (
              <button type="button" onClick={() => leave(() => { setCreating(true); setShowForm(true); })}
                className="inline-flex h-9 items-center gap-1.5 rounded-full bg-ink px-4 text-xs font-semibold text-white hover:bg-ink/85">
                <Plus size={14} /> <T>Tambah Jenis</T>
              </button>
            )}
          </div>

          {/* Daftar jenis di kiri (per kategori), rincian jenis terpilih di kanan (seperti Komponen Payroll). */}
          <div className="grid gap-4 p-4 md:grid-cols-[18rem_1fr]">
            <nav className="h-fit overflow-hidden rounded-2xl border border-gray-200 bg-white">
              {LEAVE_CATEGORIES.map((c) => {
                const list = policies.filter((p) => p.category === c.key);
                if (!list.length) return null;
                return (
                  <div key={c.key}>
                    <p className="flex items-center gap-2 border-b border-gray-100 bg-gray-50/80 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: TONE[c.key] ?? "#94a3b8" }} /> <T>{c.label}</T> <span className="text-gray-300">{list.length}</span>
                    </p>
                    {list.map((p) => {
                      const on = !creating && p.id === selected?.id;
                      return (
                        <button key={p.id} type="button" onClick={() => { if (!on) leave(() => { setCreating(false); setSelectedId(p.id); }); }}
                          className={`flex w-full items-center gap-2.5 border-b border-gray-100 px-4 py-2.5 text-left ${on ? "bg-brand/10" : "hover:bg-gray-50"} ${p.isActive ? "" : "opacity-55"}`}>
                          <span className="flex h-7 min-w-10 items-center justify-center rounded-lg px-1.5 text-[10px] font-bold text-white" style={{ background: TONE[p.category] ?? "#94a3b8" }}>{p.code}</span>
                          <span className={`min-w-0 flex-1 truncate text-sm ${on ? "font-semibold text-brand" : "text-gray-700"}`}>{t(p.name)}</span>
                          <ChevronRight size={14} className={on ? "text-brand" : "text-gray-300"} />
                        </button>
                      );
                    })}
                  </div>
                );
              })}
              {policies.length === 0 && <p className="px-4 py-8 text-center text-sm text-gray-400"><T>Belum ada jenis cuti.</T></p>}
            </nav>

            {creating && canEdit && (
              <div className="relative h-fit overflow-hidden rounded-2xl border border-gray-200 bg-white">
                <span className="absolute inset-y-0 left-0 w-1.5 bg-ink" />
                <div className="p-4 pl-5">
                  <p className="mb-4 font-bold text-gray-900"><T>Tambah Jenis Cuti</T></p>
                  <PolicyForm key="new" policy="new" onDirty={setDirty} onClose={() => { setDirty(false); setCreating(false); }} />
                </div>
              </div>
            )}
            {!creating && selected && (() => {
              const p = selected, tone = TONE[p.category] ?? "#94a3b8";
              return (
                <div className="relative h-fit overflow-hidden rounded-2xl border border-gray-200 bg-white">
                  <span className="absolute inset-y-0 left-0 w-1.5" style={{ background: tone }} />
                  <div className="p-4 pl-5">
                    <div className={`flex items-start gap-3 ${p.isActive ? "" : "opacity-55"}`}>
                      <span className="flex h-9 min-w-12 items-center justify-center rounded-xl px-2 text-[11px] font-bold text-white" style={{ background: tone }}>{p.code}</span>
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-gray-900">{t(p.name)}</p>
                        <p className="text-xs text-gray-500"><T>{categoryLabel(p.category)}</T>{!p.isActive && <> · <T>Nonaktif</T></>}</p>
                      </div>
                      {canEdit && <button type="button" onClick={() => remove(p)} disabled={pending} aria-label={t("Hapus")} className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-brand disabled:opacity-30"><Trash2 size={14} /></button>}
                    </div>
                    <p className="mt-3 text-lg font-bold text-gray-900">
                      {p.accrualPerMonth > 0 ? <>+{p.accrualPerMonth} <T>hari tiap genap 1 bulan kerja</T></> : <Quota p={p} />}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {p.paid ? <Chip tone="green"><T>Upah dibayar</T></Chip> : <Chip tone="rose"><T>Tanpa upah</T></Chip>}
                      {p.deductsAnnual && <Chip tone="amber"><T>Potong cuti tahunan</T></Chip>}
                      {p.forStatus && <Chip tone="blue"><T>{p.forStatus === "TETAP" ? "Khusus karyawan tetap" : "Khusus karyawan kontrak"}</T></Chip>}
                      {p.gender && <Chip tone="blue"><T>{p.gender === "P" ? "Khusus perempuan" : "Khusus laki-laki"}</T></Chip>}
                      {p.minServiceMonths > 0 && <Chip><T>Masa kerja min.</T> {p.minServiceMonths} <T>bulan</T></Chip>}
                      {p.noticeDays > 0 && <Chip><T>Ajukan</T> H-{p.noticeDays}</Chip>}
                      {p.period === "TAHUN" && p.quota !== null && !(p.accrualPerMonth > 0) && <Chip tone="green"><T>{p.renewal === "JANUARI" ? "Diperbarui 1 Januari" : "Diperbarui ulang tahun kerja"}</T></Chip>}
                      {p.carryOverDays > 0 && <Chip><T>Sisa dibawa</T> {p.carryOverDays} <T>hari</T>{p.carryOverExpires && p.carryOverExpiry ? <> · s/d {expiryLabel(p.carryOverExpiry)}</> : null}</Chip>}
                      {p.allowHalfDay && <Chip tone="blue"><T>Bisa setengah hari</T></Chip>}
                      {p.needsAttachment && <Chip><Paperclip size={10} /> {p.attachmentNote ? t(p.attachmentNote) : <T>Lampiran</T>}</Chip>}
                    </div>
                    {p.payNote && <p className="mt-2 text-xs text-gray-600"><Coins size={12} className="mr-1 inline text-gray-400" />{t(p.payNote)}</p>}
                    {canEdit && (
                      <>
                        {/* Garis pembatas sekaligus tombol buka / sembunyikan formulir ubah. */}
                        <button type="button" onClick={() => setShowForm((v) => !v)} aria-expanded={showForm}
                          className="group mt-4 flex w-full items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400 hover:text-brand">
                          <span className="h-px flex-1 bg-gray-200 group-hover:bg-brand/40" />
                          <T>{showForm ? "Sembunyikan pengaturan" : "Tampilkan pengaturan"}</T>
                          <ChevronDown size={14} className={`transition-transform ${showForm ? "rotate-180" : ""}`} />
                          <span className="h-px flex-1 bg-gray-200 group-hover:bg-brand/40" />
                        </button>
                        <div className={showForm ? "pt-4" : "hidden"}>
                          <PolicyForm key={`${p.id}:${p.updatedAt}`} policy={p} onDirty={setDirty} onClose={() => {}} />
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        </section>}
      </main>
    </div>
  );
}

// Batas mundur "Ajukan Tidak Masuk" (menu Kehadiran karyawan): pengajuan mendadak tanpa batas H-x.
function AbsenceSetting({ value, canEdit }: { value: number; canEdit: boolean }) {
  const t = useT();
  const [days, setDays] = useState(String(value));
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-gray-200 bg-white px-5 py-3 text-sm text-gray-700">
      <T>Pengajuan tidak masuk mendadak: boleh mundur sampai</T>
      <input type="number" min={0} max={31} value={days} disabled={!canEdit} onChange={(e) => setDays(e.target.value)}
        className="h-8 w-16 rounded-lg border border-gray-200 px-2 text-center text-sm" />
      <T>hari ke belakang</T>
      {canEdit && Number(days) !== value && (
        <button type="button" disabled={pending} onClick={() => start(async () => {
          const r = await saveAbsenceBackDays(Number(days));
          if (r.error) void showNotice(t(r.error), "error"); else void showNotice(t("Batas mundur tersimpan."));
        })} className="ml-auto inline-flex h-8 items-center rounded-full bg-ink px-4 text-xs font-semibold text-white disabled:opacity-50"><T>Simpan</T></button>
      )}
    </div>
  );
}

// Proses cuti: pengajuan yang menunggu persetujuan dan karyawan yang sedang cuti hari ini. Admin & Super Admin memantau;
// keputusan tetap di penyetuju (atasan langsung / level Workflow) lewat Notifikasi. ?lihat= dari kotak kartu Beranda.
function RequestsTab({ rows, onLeave, view }: { rows: LeaveRequestRow[]; onLeave: LeaveRequestRow[]; view?: "pengajuan" | "sedang" }) {
  const t = useT();
  const fmt = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const num = (n: number) => String(n).replace(".", ",");
  const item = (r: LeaveRequestRow, pill: React.ReactNode) => (
    <li key={r.id} className="flex flex-wrap items-start gap-3 px-5 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-900">{r.name} <span className="text-xs font-normal text-gray-400">{[r.employeeId, r.department].filter(Boolean).join(" · ")}</span></p>
        <p className="text-sm text-gray-700">{t(r.policy)}{r.urgent && <span className="ml-1.5 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700"><T>Tidak masuk (mendadak)</T></span>}</p>
        <p className="text-xs text-gray-500">{fmt(r.start)}{r.end !== r.start && <> – {fmt(r.end)}</>} · {num(r.days)} <T>hari</T> · <T>Diajukan</T> {fmt(r.createdAt.slice(0, 10))}</p>
        {r.reason && <p className="mt-1 text-xs text-gray-500">{r.reason}</p>}
        {r.delegate && <p className="mt-0.5 text-[11px] text-gray-500"><T>Delegasi tanggung jawab</T>: {r.delegate}</p>}
      </div>
      <div className="text-right">{pill}<p className="mt-1 text-[11px] text-gray-500">{r.approver}</p></div>
    </li>
  );
  const block = (title: string, hint: string, list: LeaveRequestRow[], empty: string, pill: React.ReactNode, tone: string) => (
    <section className="rounded-2xl border border-gray-200 bg-white">
      <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-4">
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br text-white ${tone}`}><FileClock size={17} /></span>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-gray-900"><T>{title}</T> <span className="text-sm font-normal text-gray-400">{list.length}</span></h3>
          <p className="text-xs text-gray-400"><T>{hint}</T></p>
        </div>
      </div>
      {list.length === 0 ? <p className="px-5 py-8 text-center text-sm text-gray-400"><T>{empty}</T></p>
        : <ul className="divide-y divide-gray-100">{list.map((r) => item(r, pill))}</ul>}
    </section>
  );
  return (
    <div className="space-y-4">
      {view !== "sedang" && block("Pengajuan Menunggu Persetujuan", "Pengajuan yang belum diputus beserta penyetuju yang sedang mendapat giliran.", rows,
        "Tidak ada pengajuan cuti yang berjalan.", <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700"><T>Menunggu</T></span>, "from-amber-500 to-orange-400")}
      {view !== "pengajuan" && block("Sedang Cuti Hari Ini", "Karyawan yang cutinya sudah disetujui dan mencakup hari ini.", onLeave,
        "Tidak ada karyawan yang sedang cuti hari ini.", <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700"><T>Sedang cuti</T></span>, "from-emerald-500 to-teal-400")}
    </div>
  );
}
