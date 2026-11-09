"use client";

import { useState, useTransition } from "react";
import {
  BadgeCheck, CalendarHeart, Coins, Loader2, Paperclip, Pencil, Plus, Scale, Trash2, Users, Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { T, useT } from "@/components/i18n";
import {
  LEAVE_CATEGORIES, LEAVE_PERIODS, LEAVE_RENEWALS, LEAVE_UNITS, categoryLabel, expiryLabel, periodLabel, unitLabel, type LeavePolicyInput,
} from "@/lib/leave";
import { deleteLeavePolicy, saveLeavePolicy } from "./actions";
import BalanceTab from "./BalanceTab";
import type { BalanceRow } from "@/lib/leave-balance";

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
  IBADAH: "#14b8a6", DINAS: "#6366f1", TANPA_UPAH: "#64748b", LAINNYA: "#94a3b8",
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

function PolicyDialog({ policy, onClose }: { policy: Policy | "new"; onClose: () => void }) {
  const t = useT();
  const [form, setForm] = useState<LeavePolicyInput>(() => policy === "new" ? EMPTY : {
    ...policy, payNote: policy.payNote ?? "", attachmentNote: policy.attachmentNote ?? "",
    legalBasis: policy.legalBasis ?? "", note: policy.note ?? "", carryOverExpiry: policy.carryOverExpiry ?? "",
  });
  const yearly = form.period === "TAHUN" && !(form.accrualPerMonth > 0);
  const [expMonth, expDay] = (form.carryOverExpiry || "03-31").split("-").map(Number);
  const setExpiry = (m: number, d: number) => set("carryOverExpiry", `${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  const [unlimited, setUnlimited] = useState(form.quota === null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof LeavePolicyInput>(k: K, v: LeavePolicyInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  // Cuti Tahunan: langsung jatah per tahun (bawaan 12 hari kerja, diperbarui 1 Januari) supaya isiannya muncul.
  const pickCategory = (category: string) => setForm((f) => (category === "TAHUNAN" && f.period !== "TAHUN" && !(f.accrualPerMonth > 0)
    ? { ...f, category, period: "TAHUN", unit: "HARI_KERJA", quota: f.quota && f.quota > 1 ? f.quota : 12, renewal: "JANUARI" }
    : { ...f, category }));

  function save() {
    setError(null);
    start(async () => {
      const r = await saveLeavePolicy(policy === "new" ? null : policy.id, { ...form, quota: unlimited ? null : form.quota });
      if (r.error) setError(r.error);
      else onClose();
    });
  }

  const select = "h-9 w-full rounded-lg border border-input bg-white px-2 text-sm";
  const check = (k: "paid" | "deductsAnnual" | "needsAttachment" | "isActive" | "allowHalfDay", label: string, hint?: string) => (
    <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-gray-200 px-3 py-2">
      <input type="checkbox" checked={form[k]} onChange={(e) => set(k, e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--color-brand)]" />
      <span><span className="block text-sm font-medium text-gray-800"><T>{label}</T></span>
        {hint && <span className="block text-[11px] text-gray-400"><T>{hint}</T></span>}</span>
    </label>
  );

  return (
    <Dialog open onOpenChange={(o: boolean) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle><T>{policy === "new" ? "Tambah Jenis Cuti" : "Ubah Jenis Cuti"}</T></DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[110px_1fr_1fr]">
            <div className="space-y-1.5"><Label className="text-xs"><T>Kode</T></Label>
              <Input value={form.code} maxLength={8} onChange={(e) => set("code", e.target.value.toUpperCase())} /></div>
            <div className="space-y-1.5"><Label className="text-xs"><T>Nama</T></Label>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} /></div>
            <div className="space-y-1.5"><Label className="text-xs"><T>Kategori</T></Label>
              <select value={form.category} onChange={(e) => pickCategory(e.target.value)} className={select}>
                {LEAVE_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{t(c.label)}</option>)}
              </select></div>
          </div>

          <div className="rounded-xl bg-gray-50 p-3">
            <p className="mb-2 text-xs font-semibold text-gray-600"><T>Jatah</T></p>
            <label className="mb-2 flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={unlimited} onChange={(e) => setUnlimited(e.target.checked)} className="h-4 w-4 accent-[var(--color-brand)]" />
              <T>Tanpa batas tetap (sesuai kebutuhan / surat dokter)</T>
            </label>
            {!unlimited && (
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1"><Label className="text-[11px] text-gray-500"><T>Jumlah</T></Label>
                  <Input type="number" min={0} value={form.quota ?? 0} onChange={(e) => set("quota", Number(e.target.value))} /></div>
                <div className="space-y-1"><Label className="text-[11px] text-gray-500"><T>Satuan</T></Label>
                  <select value={form.unit} onChange={(e) => set("unit", e.target.value)} className={select}>
                    {LEAVE_UNITS.map((u) => <option key={u.key} value={u.key}>{t(u.label)}</option>)}
                  </select></div>
                <div className="space-y-1"><Label className="text-[11px] text-gray-500"><T>Berlaku</T></Label>
                  <select value={form.period} onChange={(e) => set("period", e.target.value)} className={select}>
                    {LEAVE_PERIODS.map((p) => <option key={p.key} value={p.key}>{t(p.label)}</option>)}
                  </select></div>
              </div>
            )}
          </div>

          {yearly && !unlimited && form.period === "TAHUN" && (
            <div className="space-y-3 rounded-xl border border-emerald-100 bg-emerald-50/40 p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5"><Label className="text-xs"><T>Jatah diperbarui</T></Label>
                  <select value={form.renewal} onChange={(e) => set("renewal", e.target.value)} className={select}>
                    {LEAVE_RENEWALS.map((r) => <option key={r.key} value={r.key}>{t(r.label)}</option>)}
                  </select>
                  <p className="text-[11px] text-gray-400"><T>{form.renewal === "JANUARI"
                    ? "Semua karyawan dapat jatah baru tiap 1 Januari. Saat mulai berhak (mis. diangkat tetap) dapat jatah prorata sampai Desember."
                    : "Jatah baru masuk di ulang tahun kerja masing-masing karyawan."}</T></p></div>
                <div className="space-y-1.5"><Label className="text-xs"><T>Sisa boleh dibawa ke periode berikutnya (maksimal hari)</T></Label>
                  <Input type="number" min={0} value={form.carryOverDays} onChange={(e) => set("carryOverDays", Number(e.target.value))} />
                  <p className="text-[11px] text-gray-400"><T>0 = semua sisa hangus saat jatah baru masuk.</T></p></div>
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
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label className="text-xs"><T>Status kerja</T></Label>
              <select value={form.forStatus ?? ""} onChange={(e) => set("forStatus", e.target.value || null)} className={select}>
                <option value="">{t("Semua status")}</option>
                <option value="TETAP">{t("Karyawan tetap")}</option>
                <option value="KONTRAK">{t("Karyawan kontrak")}</option>
              </select></div>
            <div className="space-y-1.5"><Label className="text-xs"><T>Saldo bertambah tiap genap 1 bulan kerja (hari)</T></Label>
              <Input type="number" min={0} step={0.5} value={form.accrualPerMonth} onChange={(e) => set("accrualPerMonth", Number(e.target.value))} />
              <p className="text-[11px] text-gray-400"><T>Isi 0 kalau tidak bertambah bulanan. Dipakai untuk Cuti Masa Kontrak.</T></p></div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5"><Label className="text-xs"><T>Masa kerja minimal (bulan)</T></Label>
              <Input type="number" min={0} value={form.minServiceMonths} onChange={(e) => set("minServiceMonths", Number(e.target.value))} /></div>
            <div className="space-y-1.5"><Label className="text-xs"><T>Diajukan paling lambat (hari sebelum)</T></Label>
              <Input type="number" min={0} value={form.noticeDays} onChange={(e) => set("noticeDays", Number(e.target.value))} /></div>
            <div className="space-y-1.5"><Label className="text-xs"><T>Berlaku untuk</T></Label>
              <select value={form.gender ?? ""} onChange={(e) => set("gender", e.target.value || null)} className={select}>
                <option value="">{t("Semua karyawan")}</option>
                <option value="P">{t("Perempuan")}</option>
                <option value="L">{t("Laki-laki")}</option>
              </select></div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {check("paid", "Upah tetap dibayar")}
            {check("deductsAnnual", "Potong cuti tahunan", "Hari yang diambil mengurangi saldo cuti tahunan.")}
            {check("needsAttachment", "Wajib lampiran")}
            {check("allowHalfDay", "Boleh setengah hari", "Karyawan bisa mengajukan 0,5 hari: masuk setelah istirahat, atau pulang saat istirahat.")}
            {check("isActive", "Aktif", "Jenis nonaktif tidak bisa dipilih saat pengajuan.")}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label className="text-xs"><T>Ketentuan upah</T></Label>
              <Input value={form.payNote} placeholder={t("Contoh: Bulan 1-4 upah penuh, bulan 5-6 75%")} onChange={(e) => set("payNote", e.target.value)} /></div>
            <div className="space-y-1.5"><Label className="text-xs"><T>Lampiran yang diminta</T></Label>
              <Input value={form.attachmentNote} placeholder={t("Contoh: Surat keterangan dokter")} onChange={(e) => set("attachmentNote", e.target.value)} /></div>
          </div>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"><T>{error}</T></p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}><T>Batal</T></Button>
          <Button onClick={save} disabled={pending} className="gap-1.5">
            {pending && <Loader2 size={15} className="animate-spin" />} <T>Simpan</T>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function LeaveClient({ policies, balances }: { policies: Policy[]; balances: BalanceRow[] }) {
  const t = useT();
  const [tab, setTab] = useState<"jenis" | "saldo">("jenis");
  const [editing, setEditing] = useState<Policy | "new" | null>(null);
  const [filter, setFilter] = useState<string>("ALL");
  const [pending, start] = useTransition();

  const active = policies.filter((p) => p.isActive);
  const annual = policies.find((p) => p.code === "CT");
  const stats = [
    { label: "Jenis Aktif", value: active.length, icon: BadgeCheck, tone: "from-brand to-rose-400" },
    { label: "Cuti Tahunan", value: annual?.quota != null ? `${annual.quota} ${t("hari")}` : "—", icon: CalendarHeart, tone: "from-emerald-500 to-teal-400" },
    { label: "Cuti Khusus", value: active.filter((p) => p.category === "KHUSUS").length, icon: Users, tone: "from-violet-500 to-indigo-400" },
    { label: "Tanpa Upah", value: active.filter((p) => !p.paid).length, icon: Coins, tone: "from-slate-500 to-slate-400" },
  ];
  const usedCategories = LEAVE_CATEGORIES.filter((c) => policies.some((p) => p.category === c.key));
  const shown = filter === "ALL" ? policies : policies.filter((p) => p.category === filter);

  function remove(p: Policy) {
    if (!window.confirm(t("Hapus jenis cuti ini?"))) return;
    start(async () => { await deleteLeavePolicy(p.id); });
  }

  return (
    <div className="bg-gray-50 min-h-full">
      <div className="bg-white border-b border-gray-100 px-6 py-4">
        <h2 className="font-bold text-gray-800"><T>Leave</T></h2>
        <p className="text-xs text-gray-400 mt-0.5">
          <T>Kebijakan cuti, izin, dan dinas perusahaan. Isi awal mengikuti UU Ketenagakerjaan dan UU KIA; sesuaikan dengan Peraturan Perusahaan.</T>
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
          {([["jenis", "Jenis Cuti", Scale], ["saldo", "Saldo Cuti", Wallet]] as const).map(([k, label, Icon]) => (
            <button key={k} type="button" onClick={() => setTab(k)}
              className={`inline-flex h-9 items-center gap-2 rounded-full px-4 text-sm ${tab === k ? "bg-ink font-semibold text-white shadow-sm" : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"}`}>
              <Icon size={15} /> <T>{label}</T>
            </button>
          ))}
        </div>

        {tab === "saldo" && <BalanceTab rows={balances} />}
        {tab === "jenis" && <section className="rounded-2xl border border-gray-200 bg-white">
          <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 px-5 py-4">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-rose-400 text-white"><Scale size={17} /></span>
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-gray-900"><T>Jenis Cuti & Izin</T></h3>
              <p className="text-xs text-gray-400"><T>Jatah hari, syarat, upah, dan dasar hukum setiap jenis cuti.</T></p>
            </div>
            <button type="button" onClick={() => setEditing("new")}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-ink px-4 text-xs font-semibold text-white hover:bg-ink/85">
              <Plus size={14} /> <T>Tambah Jenis</T>
            </button>
          </div>

          <div className="no-scrollbar flex gap-1 overflow-x-auto border-b border-gray-100 px-4 py-2">
            {[{ key: "ALL", label: "Semua" }, ...usedCategories].map((c) => (
              <button key={c.key} type="button" onClick={() => setFilter(c.key)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${filter === c.key ? "bg-ink text-white" : "text-gray-500 hover:bg-gray-100"}`}>
                <T>{c.label}</T> <span className="opacity-60">{c.key === "ALL" ? policies.length : policies.filter((p) => p.category === c.key).length}</span>
              </button>
            ))}
          </div>

          <div className="grid gap-4 p-4 md:grid-cols-2">
            {shown.map((p) => (
              <div key={p.id} className={`relative overflow-hidden rounded-2xl border border-gray-200 bg-white ${p.isActive ? "" : "opacity-55"}`}>
                <span className="absolute inset-y-0 left-0 w-1.5" style={{ background: TONE[p.category] ?? "#94a3b8" }} />
                <div className="p-4 pl-5">
                  <div className="flex items-start gap-3">
                    <span className="flex h-9 min-w-11 items-center justify-center rounded-xl px-2 text-[11px] font-bold text-white" style={{ background: TONE[p.category] ?? "#94a3b8" }}>
                      {p.code}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-gray-900">{t(p.name)}</p>
                      <p className="text-xs text-gray-500"><T>{categoryLabel(p.category)}</T>{!p.isActive && <> · <T>Nonaktif</T></>}</p>
                    </div>
                    <button type="button" onClick={() => setEditing(p)} aria-label={t("Ubah")} className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-brand"><Pencil size={14} /></button>
                    <button type="button" onClick={() => remove(p)} disabled={pending} aria-label={t("Hapus")} className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-brand disabled:opacity-30"><Trash2 size={14} /></button>
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
                </div>
              </div>
            ))}
          </div>
        </section>}
      </main>
      {editing && <PolicyDialog policy={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
