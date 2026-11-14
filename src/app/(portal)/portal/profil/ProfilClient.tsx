"use client";

import { useState, useTransition } from "react";
import { Banknote, Briefcase, CalendarDays, Check, Clock, KeyRound, Loader2, Pencil, Plus, Trash2, User, UserCog, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { T, useT } from "@/components/i18n";
import { formatDate, formatRupiah } from "@/lib/utils";
import { FAMILY_RELATIONS } from "@/lib/personal-info";
import { PROFILE_FIELDS, fieldLabel, showValue, type FamilyRow, type ProfileChanges } from "@/lib/profile-change";
import type { DayShift } from "@/lib/schedule";
import AttendanceCalendar from "../admin/karyawan/[id]/AttendanceCalendar";
import { cancelProfileChange, changeMyPassword, submitProfileChange } from "./actions";
import RegionSelect from "@/components/RegionSelect";

type Me = {
  id: string; name: string; employeeId: string | null; image: string | null; status: string; position: string | null; branch: string | null;
  department: string | null; manager: string | null; joinDate: string | null; contractEnd: string | null; tenure: string | null;
  ptkp: string | null; bpjsTk: string | null; bpjsKes: string | null;
};
type Salary = { effectiveDate: string; basic: number; dailyWage: number | null; monthlyFactor: number | null; allowances: { name: string; amount: number }[] };
type Req = { id: string; status: string; changes: ProfileChanges; family: FamilyRow[] | null; reason: string | null; note: string | null; decidedBy: string | null; decidedAt: string | null; createdAt: string };
type CalendarProps = React.ComponentProps<typeof AttendanceCalendar>;

const STATUS: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "Menunggu persetujuan Admin", cls: "bg-amber-100 text-amber-700" },
  APPROVED: { label: "Disetujui", cls: "bg-emerald-100 text-emerald-700" },
  REJECTED: { label: "Ditolak", cls: "bg-rose-100 text-rose-700" },
  CANCELLED: { label: "Dibatalkan", cls: "bg-gray-100 text-gray-500" },
};
const EMP_STATUS: Record<string, string> = { TETAP: "Tetap", KONTRAK: "Kontrak", PROBATION: "Probation", MAGANG: "Magang", HARIAN: "Harian" };
const d = (v: string | null) => (v ? formatDate(new Date(v)) : "—");

function Section({ icon: Icon, title, children, action }: { icon: React.ElementType; title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white">
      <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-3">
        <Icon size={16} className="text-brand" />
        <h3 className="flex-1 text-sm font-semibold text-gray-800"><T>{title}</T></h3>
        {action}
      </div>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}
const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="grid grid-cols-[140px_1fr] gap-3 py-1.5 text-sm sm:grid-cols-[180px_1fr]">
    <span className="text-gray-500"><T>{label}</T></span>
    <span className="min-w-0 break-words font-medium text-gray-900">{value || "—"}</span>
  </div>
);

export default function ProfilClient({ me, salary, values, family, calendar, requests }: {
  me: Me; salary: Salary | null; values: Record<string, string>; family: FamilyRow[];
  calendar: { attendances: CalendarProps["attendances"]; leaves: CalendarProps["leaves"]; trips: CalendarProps["trips"]; shiftDays: Record<string, DayShift> };
  requests: Req[];
}) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const pending = requests.find((r) => r.status === "PENDING");
  const groups = [...new Set(PROFILE_FIELDS.map((f) => f.group))];
  // Profil dibagi per tab supaya tidak memanjang ke bawah.
  const tabs = [
    { key: "data", label: "Data Diri", icon: User },
    { key: "kerja", label: "Pekerjaan", icon: Briefcase },
    { key: "hadir", label: "Kehadiran", icon: CalendarDays },
    { key: "akun", label: "Akun", icon: UserCog },
  ];
  const [tab, setTab] = useState("data");

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6">
      {/* Kepala profil */}
      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-gray-200 bg-white p-5">
        {me.image
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={me.image} alt="" className="h-16 w-16 rounded-full object-cover" />
          : <span className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-brand to-amber-400 text-xl font-bold text-white">{me.name.slice(0, 1)}</span>}
        <div className="min-w-0 flex-1">
          <p className="text-lg font-bold text-gray-900">{me.name}</p>
          <p className="text-sm text-gray-500">{[me.employeeId, me.position, me.department].filter(Boolean).join(" · ")}</p>
        </div>
        <Button size="sm" disabled={!!pending} className="gap-1.5" onClick={() => setEditing(true)}>
          <Pencil size={14} /> <T>Ajukan Perubahan Data</T>
        </Button>
      </div>

      {pending && <RequestCard r={pending} />}

      <div className="flex flex-wrap gap-1 rounded-2xl border border-gray-200 bg-white p-1.5">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button key={key} type="button" onClick={() => setTab(key)}
            className={`inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm ${tab === key ? "bg-ink font-semibold text-white" : "text-gray-500 hover:bg-gray-100"}`}>
            <Icon size={15} /> <T>{label}</T>
          </button>
        ))}
      </div>

      {tab === "data" && (
        <>
          <div className="grid gap-5 lg:grid-cols-2">
            {groups.map((g) => (
              <Section key={g} icon={g === "Rekening & Pajak" ? KeyRound : User} title={g}>
                {g === "Data Diri" && <Row label="Nama Lengkap" value={me.name} />}
                {PROFILE_FIELDS.filter((f) => f.group === g && f.type !== "region"
                  && !((f.key === "currentAddress" || f.key === "currentRegionName" || f.key === "currentPostal") && values.addressSameAsId === "true")).map((f) => (
                  <Row key={f.key} label={f.label} value={f.type === "date" ? d(values[f.key] || null) : t(showValue(f.key, values[f.key]))} />
                ))}
                {g === "Rekening & Pajak" && (
                  <>
                    <Row label="Status PTKP" value={me.ptkp} />
                    <Row label="No. BPJS Ketenagakerjaan" value={me.bpjsTk} />
                    <Row label="No. BPJS Kesehatan" value={me.bpjsKes} />
                  </>
                )}
              </Section>
            ))}
            <Section icon={Users} title="Keluarga">
              {family.length === 0 ? <p className="text-sm text-gray-400"><T>Belum ada data keluarga.</T></p> : (
                <div className="divide-y divide-gray-100">
                  {family.map((f, i) => (
                    <div key={i} className="flex flex-wrap gap-x-4 py-2 text-sm">
                      <span className="font-medium text-gray-900">{f.name}</span>
                      <span className="text-gray-500"><T>{f.relation}</T></span>
                      {f.idNumber && <span className="text-gray-400">{f.idNumber}</span>}
                    </div>
                  ))}
                </div>
              )}
            </Section>
          </div>
        </>
      )}

      {tab === "kerja" && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Section icon={Briefcase} title="Pekerjaan">
            <Row label="Jabatan" value={me.position} />
            <Row label="Departemen" value={me.department} />
            <Row label="Cabang" value={me.branch} />
            <Row label="Atasan Langsung" value={me.manager ?? <span className="text-rose-600"><T>Belum diatur (hubungi HRD)</T></span>} />
            <Row label="Status" value={t(EMP_STATUS[me.status] ?? me.status)} />
            <Row label="Tanggal Masuk" value={d(me.joinDate)} />
            <Row label="Masa Kerja" value={me.tenure} />
            {me.status === "KONTRAK" && <Row label="Akhir Kontrak" value={d(me.contractEnd)} />}
            <p className="mt-2 text-[11px] text-gray-400"><T>Data pekerjaan diatur HRD.</T></p>
          </Section>
          <Section icon={Banknote} title="Gaji & Tunjangan">
            {!salary ? <p className="text-sm text-gray-400"><T>Belum ada data gaji (hubungi HRD).</T></p> : (
              <>
                {salary.dailyWage ? <Row label="Gaji Harian" value={`${formatRupiah(salary.dailyWage)} × ${salary.monthlyFactor ?? 0}`} /> : null}
                <Row label={salary.dailyWage ? "Gaji Pokok (setara bulanan)" : "Gaji Pokok"} value={formatRupiah(salary.basic)} />
                {salary.allowances.map((a, i) => <Row key={i} label={a.name} value={formatRupiah(a.amount)} />)}
                <div className="mt-1 grid grid-cols-[140px_1fr] gap-3 border-t border-gray-100 pt-2 text-sm font-semibold text-gray-900 sm:grid-cols-[180px_1fr]">
                  <span><T>Total</T></span>
                  <span>{formatRupiah(salary.basic + salary.allowances.reduce((n, a) => n + a.amount, 0))}</span>
                </div>
                <p className="mt-2 text-[11px] text-gray-400"><T>Berlaku sejak</T> {d(salary.effectiveDate)}. <T>Rincian potongan dan pajak ada di Slip Gaji.</T></p>
              </>
            )}
          </Section>
        </div>
      )}

      {tab === "hadir" && (
        <AttendanceCalendar attendances={calendar.attendances} leaves={calendar.leaves} trips={calendar.trips} shiftDays={calendar.shiftDays} />
      )}

      {tab === "akun" && (
        <div className="grid gap-5 lg:grid-cols-2">
          <PasswordCard />
          <Section icon={Clock} title="Riwayat Pengajuan Perubahan">
            {requests.filter((r) => r.status !== "PENDING").length === 0
              ? <p className="text-sm text-gray-400"><T>Belum ada.</T></p>
              : <div className="space-y-3">{requests.filter((r) => r.status !== "PENDING").map((r) => <RequestCard key={r.id} r={r} compact />)}</div>}
          </Section>
        </div>
      )}

      {editing && <ChangeDialog values={values} family={family} onClose={() => setEditing(false)} />}
    </div>
  );
}

function RequestCard({ r, compact }: { r: Req; compact?: boolean }) {
  const t = useT();
  const [pending, start] = useTransition();
  const st = STATUS[r.status] ?? { label: r.status, cls: "bg-gray-100 text-gray-600" };
  return (
    <div className={compact ? "rounded-xl bg-gray-50 p-3" : "rounded-2xl border border-amber-200 bg-amber-50/60 p-4"}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${st.cls}`}><T>{st.label}</T></span>
        <span className="text-xs text-gray-500">{formatDate(new Date(r.createdAt))}</span>
        {r.status === "PENDING" && (
          <button type="button" disabled={pending} onClick={() => start(async () => { await cancelProfileChange(r.id); })}
            className="ml-auto text-xs font-medium text-gray-500 hover:text-rose-600"><T>Batalkan pengajuan</T></button>
        )}
      </div>
      <ul className="mt-2 space-y-1 text-xs text-gray-700">
        {Object.entries(r.changes).map(([k, v]) => (
          <li key={k}><b>{t(fieldLabel(k))}</b>: <span className="text-gray-400 line-through">{t(showValue(k, v.old))}</span> → {t(showValue(k, v.new))}</li>
        ))}
        {r.family && <li><b><T>Keluarga</T></b>: {r.family.map((f) => `${f.name} (${t(f.relation)})`).join(", ") || "—"}</li>}
      </ul>
      {r.reason && <p className="mt-1 text-xs text-gray-500"><T>Alasan</T>: {r.reason}</p>}
      {r.note && <p className="mt-1 text-xs text-gray-500"><T>Catatan Admin</T>: {r.note}{r.decidedBy && ` · ${r.decidedBy}`}</p>}
    </div>
  );
}

function ChangeDialog({ values, family, onClose }: { values: Record<string, string>; family: FamilyRow[]; onClose: () => void }) {
  const t = useT();
  const [form, setForm] = useState(values);
  const [rows, setRows] = useState<FamilyRow[]>(family);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const familyChanged = JSON.stringify(rows) !== JSON.stringify(family);
  const submit = () => start(async () => {
    const r = await submitProfileChange({ values: form, family: familyChanged ? rows : null, reason });
    if (r.error) setError(r.error); else onClose();
  });
  const field = "h-9 w-full rounded-lg border border-input bg-white px-2 text-sm";
  return (
    <Dialog open onOpenChange={(o: boolean) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle><T>Ajukan Perubahan Data</T></DialogTitle></DialogHeader>
        <p className="-mt-2 text-xs text-gray-500"><T>Ubah data yang perlu diperbaiki. Data baru berlaku setelah disetujui Admin.</T></p>
        {[...new Set(PROFILE_FIELDS.map((f) => f.group))].map((g) => (
          <div key={g} className="space-y-2">
            <p className="pt-1 text-xs font-semibold uppercase tracking-wide text-gray-400"><T>{g}</T></p>
            <div className="grid gap-3 sm:grid-cols-2">
              {PROFILE_FIELDS.filter((f) => f.group === g).map((f) => {
                if ((f.key === "currentAddress" || f.key === "currentRegion") && form.addressSameAsId === "true") return null;
                if (f.type === "regionName" || f.type === "postal") return null;
                if (f.type === "region") return (
                  <div key={f.key} className="sm:col-span-2">
                    <RegionSelect label={f.label} value={form[f.key] ?? ""}
                      postal={f.postalKey ? form[f.postalKey] ?? "" : undefined}
                      onPostalChange={f.postalKey ? (v) => set(f.postalKey!, v) : undefined}
                      onChange={(code, name, postal) => { set(f.key, code); if (f.nameKey) set(f.nameKey, name); if (f.postalKey) set(f.postalKey, postal); }} />
                  </div>
                );
                if (f.type === "flag") return (
                  <label key={f.key} className="flex items-center gap-2 text-sm text-gray-700 sm:col-span-2">
                    <input type="checkbox" checked={form[f.key] === "true"} onChange={(e) => set(f.key, e.target.checked ? "true" : "false")} className="h-4 w-4 accent-[var(--color-brand)]" />
                    <T>{f.label}</T>
                  </label>
                );
                return (
                  <div key={f.key} className={`space-y-1 ${f.type === "textarea" ? "sm:col-span-2" : ""}`}>
                    <Label className="text-xs"><T>{f.label}</T></Label>
                    {f.type === "select" ? (
                      <select className={field} value={form[f.key]} onChange={(e) => set(f.key, e.target.value)}>
                        <option value="">—</option>
                        {f.options!.map((o) => <option key={o} value={o}>{t(o)}</option>)}
                      </select>
                    ) : f.type === "textarea" ? (
                      <textarea rows={2} value={form[f.key]} onChange={(e) => set(f.key, e.target.value)} className="w-full rounded-lg border border-input px-2 py-1.5 text-sm" />
                    ) : (
                      <Input type={f.type === "date" ? "date" : "text"} value={form[f.key]} onChange={(e) => set(f.key, e.target.value)} className="h-9" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        <div className="space-y-2">
          <p className="pt-1 text-xs font-semibold uppercase tracking-wide text-gray-400"><T>Keluarga</T></p>
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_120px_1fr_28px] items-center gap-2">
              <Input placeholder={t("Nama")} value={r.name} className="h-9" onChange={(e) => setRows((x) => x.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)))} />
              <select className={field} value={r.relation} onChange={(e) => setRows((x) => x.map((y, j) => (j === i ? { ...y, relation: e.target.value } : y)))}>
                <option value="">—</option>
                {FAMILY_RELATIONS.map((o) => <option key={o} value={o}>{t(o)}</option>)}
              </select>
              <Input placeholder={t("ID Number")} value={r.idNumber} className="h-9" onChange={(e) => setRows((x) => x.map((y, j) => (j === i ? { ...y, idNumber: e.target.value } : y)))} />
              <button type="button" aria-label={t("Hapus baris")} className="rounded p-1 text-gray-400 hover:text-rose-600" onClick={() => setRows((x) => x.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
            </div>
          ))}
          <button type="button" className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline" onClick={() => setRows((x) => [...x, { name: "", idNumber: "", relation: "" }])}>
            <Plus size={12} /> <T>Tambah anggota keluarga</T>
          </button>
        </div>
        <div className="space-y-1">
          <Label className="text-xs"><T>Alasan / keterangan (opsional)</T></Label>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("Mis. pindah alamat, ganti nomor HP")} />
        </div>
        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700"><T>{error}</T></p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}><T>Batal</T></Button>
          <Button disabled={pending} className="gap-1.5" onClick={submit}>{pending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} <T>Kirim ke Admin</T></Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PasswordCard() {
  const t = useT();
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const save = () => start(async () => {
    if (next !== again) return setMsg({ ok: false, text: "Konfirmasi password tidak cocok" });
    const r = await changeMyPassword(cur, next);
    if (r.error) setMsg({ ok: false, text: r.error });
    else { setMsg({ ok: true, text: "Password berhasil diganti." }); setCur(""); setNext(""); setAgain(""); }
  });
  return (
    <Section icon={KeyRound} title="Ganti Password">
      <div className="space-y-2">
        <Input type="password" placeholder={t("Password saat ini")} value={cur} onChange={(e) => setCur(e.target.value)} />
        <Input type="password" placeholder={t("Password baru (minimal 8 karakter)")} value={next} onChange={(e) => setNext(e.target.value)} />
        <Input type="password" placeholder={t("Ulangi password baru")} value={again} onChange={(e) => setAgain(e.target.value)} />
        {msg && <p className={`flex items-center gap-1 text-xs ${msg.ok ? "text-emerald-700" : "text-rose-600"}`}>{msg.ok ? <Check size={12} /> : <X size={12} />} <T>{msg.text}</T></p>}
        <div className="flex justify-end"><Button size="sm" disabled={pending || !cur || !next} onClick={save}><T>Simpan Password</T></Button></div>
      </div>
    </Section>
  );
}
