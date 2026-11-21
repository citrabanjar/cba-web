"use client";

import { Fragment, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { BriefcaseBusiness, ChevronDown, ChevronRight, Hash, Hourglass, Loader2, Mail, MessageCircle, Pencil, Phone, Plus, Trash2, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import EmployeeCombobox from "@/components/portal/EmployeeCombobox";
import ActionMenu, { QUICK_ACTIONS as ACTION_ITEMS } from "@/components/portal/ActionMenu";
import { formatDate, formatDateTime, formatRupiah } from "@/lib/utils";
import type { MasterOptions } from "@/lib/master-data";
import { BANK_OPTIONS, isCashBank, FAMILY_RELATIONS, ID_TYPES, PERSONAL_CHOICES, PERSONAL_LOG_LABELS, PTKP_STATUSES, TAX_OBJECT_CODES, TAX_STATUSES, WORK_LOG_LABELS, normalizeChoice } from "@/lib/personal-info";
import {
  addEmploymentEvent, addJobChange, addSalaryAdjustment, reactivateEmployee, saveFamily, updateEmployee,
} from "../actions";
import { T, useT } from "@/components/i18n";
import { useCanApply, useCanEdit, useCanPropose } from "@/components/portal/edit-access";
import { proposedText } from "@/lib/approval-text";
import AttendanceCalendar from "./AttendanceCalendar";
import ScheduleCard, { type ScheduleRow } from "./ScheduleCard";
import type { DayShift } from "@/lib/schedule";
import type { BalanceRow } from "@/lib/leave-balance";
import Pph21Card, { type Pph21Year } from "./Pph21Card";
import PriorTaxCard, { type PriorSlipItem } from "./PriorTaxCard";
import PayComponentsCard, { type PayComponentRow } from "./PayComponentsCard";
import ProfileLoans from "@/components/portal/LoanManager";
import type { LoanView } from "@/components/portal/LoanCard";
import RegionSelect from "@/components/RegionSelect";
import { askConfirm, showNotice } from "@/components/portal/Confirm";

type Salary = {
  id: string; effectiveDate: Date; basicSalary: number; dailyWage: number | null; monthlyFactor: number | null; bpjsTkBase: number | null;
  bpjsKesBase: number | null; note: string | null; createdBy: string | null;
  components: { id: string; type: string; name: string; amount: number; code: string | null }[];
};

type Employee = {
  id: string; employeeNo: number | null; employeeId: string; name: string;
  email: string | null; phone: string | null; image: string | null; role: string;
  menuAccess: string[]; employmentStatus: string; position: string | null;
  branch: string | null; joinDate: Date | null; contractEndDate: Date | null;
  resignDate: Date | null; paymentSchedule: string | null;
  spkNumber: string | null; spkDate: Date | null;
  bankName: string | null; bankAccount: string | null; bankHolder: string | null;
  isActive: boolean; attendanceExempt?: boolean; idType: string | null; ktpNumber: string | null; address: string | null;
  currentAddress: string | null; addressSameAsId: boolean;
  addressRegion: string | null; addressRegionName: string | null; currentRegion: string | null; currentRegionName: string | null;
  addressPostal: string | null; currentPostal: string | null;
  birthPlace: string | null; birthDate: Date | null; gender: string | null;
  religion: string | null; maritalStatus: string | null; nationality: string | null;
  npwp: string | null; ptkpStatus: string | null;
  taxability: string | null; taxStatus: string | null; taxObjectCode: string | null;
  bpjsTkNumber: string | null; bpjsTkActive: boolean; bpjsKesNumber: string | null;
  bpjsKesActive: boolean; managerId: string | null;
  manager: { name: string; employeeId: string | null } | null;
  department: { id: string; name: string } | null;
  employmentEvents: {
    id: string; type: string; effectiveDate: Date; contractEndDate: Date | null;
    spkNumber: string | null; reason: string | null; createdBy: string | null;
  }[];
  family: { id: string; name: string; idNumber: string | null; relation: string }[];
  changeLogs: { id: string; field: string; changedBy: string | null; createdAt: Date }[];
  attendances: {
    id: string; date: Date; checkIn: Date | null; checkOut: Date | null;
    checkInAddr: string | null; status: string; note: string | null;
  }[];
  leaves: {
    id: string; type: string; startDate: Date; endDate: Date;
    totalDays: number; reason: string; status: string; policy: { code: string; name: string } | null;
  }[];
  businessTrips: {
    id: string; destination: string; purpose: string; startDate: Date;
    endDate: Date; totalDays: number; status: string;
  }[];
  salaries: Salary[];
  payslips: {
    id: string; periodLabel: string; netPay: number;
    paidAt: Date | null; paidVia: string | null;
  }[];
};

type Option = { value: string; label: string };
type FormField = {
  key: string; label: string; hint?: string;
  type?: "date" | "email" | "select" | "suggest" | "check" | "region"; options?: Option[];
  nameKey?: string; // type "region": kunci nama lengkap wilayah yang ikut disimpan
  postalKey?: string; // type "region": kunci kode pos
};
type Section = "detail" | "unit" | "bank" | "payroll" | "pribadi" | "alamat" | "pajak" | "bpjs";
type EditMode = "ubah" | "PERPANJANGAN" | "PEMBERHENTIAN" | "TRANSFER";
type Component = { type: "TUNJANGAN" | "POTONGAN"; name: string; amount: number; code: string | null };
type PayOption = { code: string; name: string; kind: string };
type FamilyRow = { name: string; idNumber: string; relation: string };

const TAB_LIST = [
  { key: "pribadi", label: "Data Diri" },
  { key: "pekerjaan", label: "Pekerjaan" },
  { key: "absensi", label: "Kehadiran" },
  { key: "cuti", label: "Cuti" }, // saldo & riwayat cuti serta dinas luar (dipisah dari Kehadiran 2026-11-21)
  { key: "gaji", label: "Payroll" },
  { key: "pinjaman", label: "Pinjaman" },
  { key: "payslip", label: "Slip & Pajak" }, // bukti hasil proses: slip gaji (payroll run) & PPh 21 (pemotongan pajak)
];

const STATUS_LABEL: Record<string, string> = {
  TETAP: "Tetap", KONTRAK: "Kontrak", HARIAN: "Harian", PROBATION: "Probation",
};
const FLAG_OPTIONS: Option[] = [
  { value: "true", label: "Ikut" }, { value: "false", label: "Tidak Ikut" },
];

const SECTION_TITLE: Record<Section, string> = {
  detail: "Detail Pekerjaan", unit: "Unit Perusahaan", payroll: "Payroll",
  bank: "Rekening Bank", pribadi: "Data Pribadi", alamat: "Tempat Tinggal",
  pajak: "Pajak", bpjs: "BPJS",
};

const EVENT_LABEL: Record<string, string> = {
  PERPANJANGAN: "Perpanjangan Kontrak", PEMBERHENTIAN: "Pemberhentian",
  MUTASI: "Mutasi", PROMOSI: "Promosi", DEMOSI: "Demosi", TRANSFER: "Transfer",
  AKTIF_KEMBALI: "Aktif Kembali",
};
const EDIT_MODES: Partial<Record<Section, EditMode[]>> = {
  detail: ["ubah", "PERPANJANGAN", "PEMBERHENTIAN"],
  unit: ["ubah", "TRANSFER"],
};
const MODE_COLOR: Record<EditMode, { active: string; idle: string }> = {
  ubah: { active: "bg-ink text-white border-ink", idle: "bg-gray-100 text-gray-700 border-gray-300" },
  PERPANJANGAN: { active: "bg-brand text-white border-brand", idle: "bg-brand/10 text-brand border-brand/30" },
  PEMBERHENTIAN: { active: "bg-rose-600 text-white border-rose-600", idle: "bg-rose-50 text-rose-700 border-rose-300" },
  TRANSFER: { active: "bg-sky-600 text-white border-sky-600", idle: "bg-sky-50 text-sky-700 border-sky-300" },
};
const STOP_TYPES = ["Resign", "Diberhentikan", "Kontrak Berakhir"];
type EventField = { key: string; label: string; type: string; options?: string[] };
const TRANSFER_TYPES = ["Mutasi", "Promosi", "Demosi"];
const JOB_CHANGE_TYPE: Record<string, "MUTASI" | "PROMOSI" | "DEMOSI"> = {
  Mutasi: "MUTASI", Promosi: "PROMOSI", Demosi: "DEMOSI",
};
const EVENT_FIELDS: Partial<Record<EditMode, EventField[]>> = {
  PERPANJANGAN: [
    { key: "effectiveDate", label: "Tanggal Berlaku *", type: "date" },
    { key: "contractEndDate", label: "Tanggal Akhir Kontrak Baru *", type: "date" },
    { key: "spkNumber", label: "No SPK", type: "text" },
    { key: "spkDate", label: "Tanggal SPK", type: "date" },
  ],
  PEMBERHENTIAN: [
    { key: "stopType", label: "Jenis Pemberhentian", type: "select", options: STOP_TYPES },
    { key: "effectiveDate", label: "Tanggal Berhenti *", type: "date" },
    { key: "note", label: "Catatan", type: "text" },
  ],
  TRANSFER: [
    { key: "transferType", label: "Jenis Transfer", type: "select", options: TRANSFER_TYPES },
    { key: "effectiveDate", label: "Tanggal Berlaku *", type: "date" },
    { key: "note", label: "Catatan", type: "text" },
  ],
};
// Shortcut dari menu Aksi di daftar karyawan.
const QUICK_ACTIONS: Record<string, { section: Section; mode: EditMode }> = {
  transfer: { section: "unit", mode: "TRANSFER" },
  resign: { section: "detail", mode: "PEMBERHENTIAN" },
};

const LEAVE_LABEL: Record<string, string> = {
  TAHUNAN: "Tahunan", SAKIT: "Sakit", MELAHIRKAN: "Melahirkan",
  PENTING: "Penting", LAINNYA: "Lainnya",
};
const APPROVAL: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "Menunggu", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  APPROVED: { label: "Disetujui", cls: "bg-green-50 text-green-700 border-green-200" },
  REJECTED: { label: "Ditolak", cls: "bg-red-50 text-red-700 border-red-200" },
  CANCELLED: { label: "Dibatalkan", cls: "bg-gray-100 text-gray-600 border-gray-200" },
};

// Kolom @db.Date tersimpan tengah malam UTC, jadi tampilkan dalam UTC.
// Zona waktu ditulis eksplisit supaya hasil server dan browser sama.
function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return formatDate(d);
}

// Angka hari cuti: 2,5 (koma desimal).
const leaveDays = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");
const LeaveRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="grid grid-cols-[150px_1fr] gap-3 py-1.5 text-sm sm:grid-cols-[190px_1fr]">
    <span className="text-gray-500"><T>{label}</T></span>
    <span className="min-w-0 break-words font-medium text-gray-900">{value}</span>
  </div>
);

// Saldo Cuti: tampilan sama dengan Saldo Pinjaman — baris per jenis cuti + tombol Lihat Riwayat (riwayat saldo),
// ditambah pemakaian cuti tanpa saldo (Sakit, Izin, cuti khusus) tahun berjalan.
function LeaveSaldo({ rows, leaves }: { rows: BalanceRow[]; leaves: Employee["leaves"] }) {
  const t = useT();
  const [year] = useState(() => new Date(Date.now() + 7 * 3600_000).getUTCFullYear());
  const usage = useMemo(() => {
    const codes = new Set(rows.map((r) => r.code));
    const sum = new Map<string, number>();
    for (const l of leaves) {
      if (l.status !== "APPROVED" || new Date(l.startDate).getUTCFullYear() !== year) continue;
      if (l.policy && codes.has(l.policy.code)) continue;
      const name = l.policy?.name ?? LEAVE_LABEL[l.type] ?? l.type;
      sum.set(name, (sum.get(name) ?? 0) + l.totalDays);
    }
    return [...sum].sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows, leaves, year]);
  if (rows.length === 0 && usage.length === 0) return <Empty text="Belum ada saldo cuti." />;
  return (
    <div className="rounded-2xl border border-gray-200 bg-white px-5 py-3">
      {rows.map((r) => (
        <div key={r.policyId} className="border-b border-gray-100 py-2 last:border-b-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-gray-900"><T>{r.policyName}</T> · {r.code}</p>
          </div>
          <LeaveRow label="Sisa saldo" value={`${leaveDays(r.balance)} ${t("hari")}`} />
          {r.pending > 0 && <LeaveRow label="Menunggu persetujuan" value={`${leaveDays(r.pending)} ${t("hari")}`} />}
          {r.pending > 0 && <LeaveRow label="Bisa diajukan" value={`${leaveDays(Math.max(0, r.balance - r.pending))} ${t("hari")}`} />}
          {r.nextDate && r.nextDays ? <LeaveRow label="Alokasi Cuti" value={`${leaveDays(r.nextDays)} ${t("hari")} ${t("pada tanggal")} ${formatDate(new Date(r.nextDate))}`} /> : null}
          {r.problem && <p className="mt-1 text-xs text-red-600"><T>{r.problem}</T> — <T>hubungi HRD</T></p>}
          {r.ledger.length > 0 && (
            <div className="mt-2 max-h-96 overflow-auto rounded-xl border border-gray-100">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-50 text-[11px] uppercase tracking-wide text-gray-400">
                  <tr><th className="px-3 py-1.5 text-left font-medium"><T>Tanggal</T></th><th className="px-3 py-1.5 text-left font-medium"><T>Keterangan</T></th><th className="px-3 py-1.5 text-left font-medium"><T>Alasan</T></th><th className="px-3 py-1.5 text-right font-medium"><T>Hari</T></th><th className="px-3 py-1.5 text-right font-medium"><T>Saldo</T></th></tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {[...r.ledger].reverse().map((l, n) => (
                    <tr key={`${l.date}-${n}`}>
                      <td className="px-3 py-1.5 text-gray-600 whitespace-nowrap">{formatDate(new Date(l.date))}</td>
                      <td className="px-3 py-1.5 text-gray-800">
                        <T>{l.label}</T>
                        {l.info && <span className="ml-1.5 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500 whitespace-nowrap"><T>Tidak memotong saldo</T></span>}
                      </td>
                      <td className="px-3 py-1.5 text-gray-500">{l.reason || "—"}</td>
                      {/* Cuti yang tidak memotong saldo: lamanya ditampilkan abu-abu tanpa tanda minus. */}
                      <td className={`px-3 py-1.5 text-right tabular-nums font-semibold whitespace-nowrap ${l.info ? "text-gray-400" : l.days < 0 ? "text-rose-600" : "text-emerald-600"}`}>{l.info ? leaveDays(l.days) : `${l.days > 0 ? "+" : ""}${leaveDays(l.days)}`}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums font-bold text-gray-900">{leaveDays(l.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
      {rows.length === 0 && usage.length > 0 && (
        <div className="border-t border-gray-100 py-2 first:border-t-0">
          <p className="text-sm font-semibold text-gray-900"><T>Pemakaian cuti lainnya tahun</T> {year}</p>
          {usage.map(([name, d]) => <LeaveRow key={name} label={name} value={`${leaveDays(d)} ${t("hari")}`} />)}
        </div>
      )}
    </div>
  );
}

const toInputDate = (d: Date | null) => (d ? new Date(d).toISOString().split("T")[0] : "");

function masterOptions(names: string[], current?: string | null): Option[] {
  const list = current && !names.includes(current) ? [current, ...names] : names;
  return [{ value: "", label: "—" }, ...list.map((value) => ({ value, label: value }))];
}

function Pill({ cls, children }: { cls: string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
      {children}
    </span>
  );
}

// Tab Data Diri bergaya CV (permintaan pemilik 2026-11-21): baris "Label : Isi" tanpa kotak, antarbagian
// dipisah garis, dan tiap bagian bisa dilipat. Bagian yang dilipat diingat per browser.
const CV_HIDDEN_KEY = "cba.cv.hidden";

type CvSection = {
  key: string; title: string; onEdit?: () => void; action?: React.ReactNode;
  // flat: isi berupa tabel/kartu bawaan; kartunya diratakan (lihat .cv-flat di globals.css) dan tanpa indentasi.
  flat?: boolean; content: React.ReactNode;
};

function CvSheet({ sections, initial }: { sections: (CvSection | false | null | undefined)[]; initial?: string }) {
  const list = sections.filter(Boolean) as CvSection[];
  const [hidden, setHidden] = useState<string[]>([]);
  useEffect(() => {
    // Dibaca setelah tampil supaya HTML server & browser sama; sama seperti PortalShell.
    let saved: string[] = [];
    try { saved = JSON.parse(localStorage.getItem(CV_HIDDEN_KEY) ?? "[]"); } catch { /* penyimpanan browser tidak tersedia */ }
    // Bagian yang dituju tautan (mis. ?tab=cuti) selalu dibuka lalu digulir ke sana.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHidden(initial ? saved.filter((k) => k !== initial) : saved);
    if (initial) requestAnimationFrame(() => document.getElementById(`cv-${initial}`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [initial]);
  const toggle = (key: string) => setHidden((h) => {
    const next = h.includes(key) ? h.filter((k) => k !== key) : [...h, key];
    try { localStorage.setItem(CV_HIDDEN_KEY, JSON.stringify(next)); } catch { /* abaikan */ }
    return next;
  });
  return (
    <section className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-200 px-5 sm:px-8">
      {list.map((s) => {
        const open = !hidden.includes(s.key);
        return (
          <div key={s.key} id={`cv-${s.key}`} className="scroll-mt-24 py-4">
            <div className="flex items-center justify-between gap-3">
              <button type="button" onClick={() => toggle(s.key)} aria-expanded={open}
                className="flex min-w-0 items-center gap-2 text-left">
                <ChevronDown size={16} className={`shrink-0 text-brand transition-transform ${open ? "" : "-rotate-90"}`} />
                <h3 className="font-semibold text-[15px] text-gray-900"><T>{s.title}</T></h3>
              </button>
              {open && (s.action || s.onEdit) && (
                <div className="flex shrink-0 items-center gap-2">
                  {s.action}
                  {s.onEdit && (
                    <button type="button" onClick={s.onEdit}
                      className="inline-flex h-7 items-center gap-1.5 rounded-full bg-ink px-3 text-xs font-semibold text-white transition-colors hover:bg-ink/85">
                      <Pencil size={12} /> <T>Edit</T>
                    </button>
                  )}
                </div>
              )}
            </div>
            {open && <div className={s.flat ? "cv-flat mt-3" : "mt-3 space-y-2 pl-6"}>{s.content}</div>}
          </div>
        );
      })}
    </section>
  );
}

function CvRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,7.5rem)_auto_minmax(0,1fr)] gap-x-2 text-sm sm:grid-cols-[13rem_auto_minmax(0,1fr)]">
      <span className="text-gray-500"><T>{label}</T></span>
      <span aria-hidden className="text-gray-400">:</span>
      <span className="font-medium text-gray-900 break-words">{children || "—"}</span>
    </div>
  );
}

// Nomor HP Indonesia diubah ke format internasional untuk tautan WhatsApp.
function waLink(phone: string | null): string | null {
  const digits = phone?.replace(/\D/g, "") ?? "";
  if (!digits) return null;
  return `https://wa.me/${digits.startsWith("0") ? `62${digits.slice(1)}` : digits}`;
}

function ContactButton({
  href, label, dark = false, children,
}: {
  href: string | null; label: string; dark?: boolean; children: React.ReactNode;
}) {
  const t = useT();
  const cls = `flex h-11 w-11 items-center justify-center rounded-full transition-colors ${
    dark ? "bg-ink text-white hover:bg-ink/85" : "border border-gray-200 bg-white text-gray-700 hover:bg-gray-100"
  }`;
  if (!href) {
    return <span aria-label={t(label)} title={t(label)} className={`${cls} pointer-events-none opacity-35`}>{children}</span>;
  }
  return (
    <a href={href} aria-label={t(label)} title={t(label)} className={cls}
      {...(href.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {})}>
      {children}
    </a>
  );
}

const TILE_TONE = {
  amber: "bg-amber-50 border-amber-100 text-amber-700",
  sky: "bg-sky-50 border-sky-100 text-sky-700",
  rose: "bg-rose-50 border-rose-100 text-rose-700",
  emerald: "bg-emerald-50 border-emerald-100 text-emerald-700",
};

// Kartu ringkasan berwarna lembut, seperti kartu "Ongoing Projects" di desain Code XR.
function SummaryTile({
  tone, icon: Icon, label, value, sub,
}: {
  tone: keyof typeof TILE_TONE; icon: React.ElementType; label: string; value: string; sub?: string;
}) {
  return (
    <div className={`rounded-2xl border p-4 ${TILE_TONE[tone]}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="rounded-full bg-white/80 px-2.5 py-0.5 text-[11px] font-semibold"><T>{label}</T></span>
        <Icon size={16} className="opacity-70" />
      </div>
      <p className="mt-3 truncate text-base font-bold text-gray-900">{value}</p>
      {sub && <p className="truncate text-xs text-gray-500">{sub}</p>}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 py-12 text-center text-sm text-gray-400">
      <T>{text}</T>
    </div>
  );
}

function salaryTotals(salary: Salary) {
  const sum = (type: string) =>
    salary.components.filter((c) => c.type === type).reduce((total, c) => total + c.amount, 0);
  const benefits = sum("TUNJANGAN");
  const deductions = sum("POTONGAN");
  return { benefits, deductions, total: salary.basicSalary + benefits - deductions };
}

function SalaryCard({ salary }: { salary: Salary }) {
  const benefits = salary.components.filter((c) => c.type === "TUNJANGAN");
  const deductions = salary.components.filter((c) => c.type === "POTONGAN");
  const rows = [
    ...(salary.dailyWage ? [{ label: `Gaji harian x ${salary.monthlyFactor ?? 0} (pengali bulanan)`, value: salary.dailyWage }] : []),
    { label: salary.dailyWage ? "Gaji Pokok (setara bulanan)" : "Gaji Pokok", value: salary.basicSalary },
    ...benefits.map((c) => ({ label: c.name, value: c.amount })),
    ...deductions.map((c) => ({ label: `Potongan: ${c.name}`, value: -c.amount })),
  ];
  return (
    <div className="py-1">
      {rows.map((r) => (
        <div key={r.label} className="flex justify-between gap-4 py-1 text-sm">
          <span className="text-gray-600"><T>{r.label}</T></span>
          <span className="text-gray-800 tabular-nums">{formatRupiah(r.value)}</span>
        </div>
      ))}
      <div className="flex justify-between gap-4 pt-2 mt-1 border-t border-gray-100 text-sm font-semibold text-gray-900">
        <span><T>Total Gaji</T></span>
        <span className="tabular-nums">{formatRupiah(salaryTotals(salary).total)}</span>
      </div>
    </div>
  );
}

function SalaryHistory({ salaries, currentId }: { salaries: Salary[]; currentId?: string }) {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="section-head px-5 py-3">
        <h3 className="font-semibold text-sm"><T>Riwayat Gaji</T></h3>
      </div>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="px-4"><T>Berlaku</T></TableHead>
            <TableHead className="px-4 text-right"><T>Gaji Pokok</T></TableHead>
            <TableHead className="hidden sm:table-cell px-4 text-right"><T>Tunjangan</T></TableHead>
            <TableHead className="hidden sm:table-cell px-4 text-right"><T>Potongan</T></TableHead>
            <TableHead className="px-4 text-right"><T>Total Gaji</T></TableHead>
            <TableHead className="hidden md:table-cell px-4"><T>Catatan</T></TableHead>
            <TableHead className="hidden md:table-cell px-4"><T>Oleh</T></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {salaries.map((s) => {
            const open = openId === s.id;
            const totals = salaryTotals(s);
            return (
              <Fragment key={s.id}>
                <TableRow>
                  <TableCell className="px-4 text-sm whitespace-nowrap">
                    <button
                      type="button"
                      aria-expanded={open}
                      onClick={() => setOpenId(open ? null : s.id)}
                      className="inline-flex items-center gap-1 hover:text-brand"
                    >
                      {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      {fmtDate(s.effectiveDate)}
                    </button>
                    {s.id === currentId && (
                      <span className="ml-2">
                        <Pill cls="bg-green-50 text-green-700 border-green-200"><T>Saat ini</T></Pill>
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="px-4 text-sm text-right tabular-nums">{formatRupiah(s.basicSalary)}</TableCell>
                  <TableCell className="hidden sm:table-cell px-4 text-sm text-right tabular-nums">{formatRupiah(totals.benefits)}</TableCell>
                  <TableCell className="hidden sm:table-cell px-4 text-sm text-right tabular-nums">{formatRupiah(totals.deductions)}</TableCell>
                  <TableCell className="px-4 text-sm text-right tabular-nums font-medium">{formatRupiah(totals.total)}</TableCell>
                  <TableCell className="hidden md:table-cell px-4 text-xs text-gray-500">{s.note ?? "—"}</TableCell>
                  <TableCell className="hidden md:table-cell px-4 text-xs text-gray-500">{s.createdBy ?? "—"}</TableCell>
                </TableRow>
                {open && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={7} className="px-4 bg-gray-50/60 whitespace-normal">
                      <div className="max-w-md"><SalaryCard salary={s} /></div>
                      {s.note && <p className="md:hidden text-xs text-gray-500 pb-1">{s.note}</p>}
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

const LOG_LABELS = { ...PERSONAL_LOG_LABELS, ...WORK_LOG_LABELS };

function ChangeHistoryDialog({ logs, onClose }: { logs: Employee["changeLogs"]; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(value: boolean) => { if (!value) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle><T>History Perubahan</T></DialogTitle></DialogHeader>
        {logs.length === 0 ? (
          <p className="py-4 text-sm text-gray-400"><T>Belum ada perubahan.</T></p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead><T>Tanggal Perubahan</T></TableHead>
                <TableHead><T>Bagian yang Diubah</T></TableHead>
                <TableHead><T>Diubah Oleh</T></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="text-sm whitespace-nowrap">{formatDateTime(log.createdAt)}</TableCell>
                  <TableCell className="text-sm"><T>{LOG_LABELS[log.field] ?? log.field}</T></TableCell>
                  <TableCell className="text-sm">{log.changedBy ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  );
}

function FamilyDialog({ employee, onClose }: { employee: Employee; onClose: () => void }) {
  const [rows, setRows] = useState<FamilyRow[]>(
    employee.family.map((f) => ({ name: f.name, idNumber: f.idNumber ?? "", relation: f.relation })),
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const patch = (index: number, change: Partial<FamilyRow>) =>
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...change } : r)));

  function save() {
    startTransition(async () => {
      try {
        await saveFamily(employee.id, rows.filter((r) => r.name.trim() || r.idNumber.trim()));
        onClose();
      } catch {
        setError("Gagal menyimpan. Nama dan jenis anggota keluarga wajib diisi.");
      }
    });
  }

  return (
    <Dialog open onOpenChange={(value: boolean) => { if (!value) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle><T>Keluarga</T></DialogTitle></DialogHeader>
        <div className="space-y-2 py-1">
          {error && <div className="text-sm px-4 py-3 rounded-lg bg-red-50 text-red-700">{error}</div>}
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_120px_auto] gap-2 items-center">
              <Input value={r.name} placeholder="Nama" aria-label="Nama" autoComplete="off"
                onChange={(e) => patch(i, { name: e.target.value.toUpperCase() })} />
              <Input value={r.idNumber} placeholder="ID Number" aria-label="ID Number"
                onChange={(e) => patch(i, { idNumber: e.target.value })} />
              <select value={r.relation} aria-label="Jenis Anggota Keluarga"
                onChange={(e) => patch(i, { relation: e.target.value })}
                className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm">
                {FAMILY_RELATIONS.map((o) => <option key={o} value={o}><T>{o}</T></option>)}
              </select>
              <button type="button" aria-label="Hapus baris"
                onClick={() => setRows((prev) => prev.filter((_, at) => at !== i))}
                className="p-1 text-gray-400 hover:text-brand">
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          <Button variant="outline" size="sm" className="gap-1.5"
            onClick={() => setRows((prev) => [...prev, { name: "", idNumber: "", relation: FAMILY_RELATIONS[0] }])}>
            <Plus size={14} /> <T>Tambah Baris</T>
          </Button>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}><T>Batal</T></Button>
          <Button size="sm" onClick={save} disabled={isPending} className="gap-2">
            {isPending && <Loader2 size={14} className="animate-spin" />}
            <T>Simpan Perubahan</T>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SalaryDialog({
  employee, current, open, onClose, payOptions,
}: {
  employee: Employee; current?: Salary; open: boolean; onClose: () => void; payOptions: PayOption[];
}) {
  const t = useT();
  const [effectiveDate, setEffectiveDate] = useState("");
  const [basicSalary, setBasicSalary] = useState(String(current?.basicSalary ?? ""));
  // Karyawan dengan jadwal bayar Mingguan diisi gaji harian; gaji bulanan = gaji harian x pengali.
  const harian = employee.paymentSchedule === "Mingguan";
  const [dailyWage, setDailyWage] = useState(String(current?.dailyWage ?? ""));
  const [monthlyFactor, setMonthlyFactor] = useState(String(current?.monthlyFactor ?? "25"));
  const monthlyEq = (Number(dailyWage) || 0) * (Number(monthlyFactor) || 0);
  const [note, setNote] = useState("");
  const [components, setComponents] = useState<Component[]>(
    (current?.components ?? []).map((c) => ({
      type: c.type as Component["type"], name: c.name, amount: c.amount, code: c.code,
    })),
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const patch = (index: number, change: Partial<Component>) =>
    setComponents((prev) => prev.map((c, i) => (i === index ? { ...c, ...change } : c)));

  function save() {
    startTransition(async () => {
      try {
        const r = await addSalaryAdjustment(employee.id, {
          effectiveDate,
          basicSalary: harian ? monthlyEq : Number(basicSalary),
          dailyWage: harian ? Number(dailyWage) : null,
          monthlyFactor: harian ? Number(monthlyFactor) : null,
          bpjsTkBase: current?.bpjsTkBase ?? undefined,
          bpjsKesBase: current?.bpjsKesBase ?? undefined,
          note,
          components: components.filter((c) => c.name.trim() && c.amount > 0),
        });
        if (r && "error" in r && r.error) { setError(r.error); return; }
        if (r && "proposed" in r && r.proposed) showNotice(proposedText(r.proposed));
        onClose();
      } catch {
        setError("Gagal menyimpan. Periksa isian; tanggal berlaku tidak boleh sama dengan riwayat yang ada.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(value: boolean) => { if (!value) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle><T>Penyesuaian Gaji</T></DialogTitle></DialogHeader>
        <div className="space-y-3 py-1">
          {error && <div className="text-sm px-4 py-3 rounded-lg bg-red-50 text-red-700">{error}</div>}
          <p className="text-xs text-gray-500">
            <T>Penyesuaian dicatat sebagai riwayat baru. Data gaji sebelumnya tidak berubah.</T>
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs"><T>Tanggal Berlaku *</T></Label>
              <Input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
            </div>
            {!harian && (
              <div className="space-y-1.5">
                <Label className="text-xs"><T>Gaji Pokok *</T></Label>
                <Input type="number" value={basicSalary} onChange={(e) => setBasicSalary(e.target.value)} />
              </div>
            )}
          </div>
          {harian && (
            <div className="space-y-2 rounded-xl bg-gray-50 p-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label className="text-xs"><T>Gaji Harian *</T></Label>
                  <Input type="number" value={dailyWage} onChange={(e) => setDailyWage(e.target.value)} /></div>
                <div className="space-y-1.5"><Label className="text-xs"><T>Pengali bulanan *</T></Label>
                  <Input type="number" step="0.5" value={monthlyFactor} onChange={(e) => setMonthlyFactor(e.target.value)} /></div>
              </div>
              <p className="text-xs text-gray-600"><T>Gaji bulanan (dasar lembur, BPJS, THR)</T>: <b>{formatRupiah(monthlyEq)}</b></p>
              <p className="text-[11px] text-gray-400"><T>Payroll mingguan membayar gaji harian x hari kerja terjadwal di minggu itu.</T></p>
            </div>
          )}
          <div className="space-y-2">
            <Label className="text-xs"><T>Tunjangan dan Potongan</T></Label>
            {components.map((c, i) => (
              <div key={i} className="grid grid-cols-[1fr_110px_auto] gap-2 items-center">
                <div className="space-y-1">
                  <select value={c.code ?? ""} aria-label={t("Komponen")}
                    onChange={(e) => {
                      const o = payOptions.find((x) => x.code === e.target.value);
                      patch(i, o ? { code: o.code, name: o.name, type: o.kind === "POTONGAN" ? "POTONGAN" : "TUNJANGAN" } : { code: null });
                    }}
                    className="h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm">
                    <option value="">{t("Lainnya (ketik nama)")}</option>
                    {(["PENDAPATAN", "POTONGAN"] as const).map((k) => (
                      <optgroup key={k} label={t(k === "PENDAPATAN" ? "Tunjangan" : "Potongan")}>
                        {payOptions.filter((o) => o.kind === k).map((o) => <option key={o.code} value={o.code}>{o.code} · {t(o.name)}</option>)}
                      </optgroup>
                    ))}
                  </select>
                  {!c.code && (
                    <div className="grid grid-cols-[100px_1fr] gap-2">
                      <select value={c.type} aria-label="Jenis"
                        onChange={(e) => patch(i, { type: e.target.value as Component["type"] })}
                        className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm">
                        <option value="TUNJANGAN">{t("Tunjangan")}</option>
                        <option value="POTONGAN">{t("Potongan")}</option>
                      </select>
                      <Input value={c.name} placeholder="Nama" onChange={(e) => patch(i, { name: e.target.value })} />
                    </div>
                  )}
                </div>
                <Input type="number" value={c.amount || ""} placeholder="Nominal"
                  onChange={(e) => patch(i, { amount: Number(e.target.value) })} />
                <button type="button" aria-label="Hapus baris"
                  onClick={() => setComponents((prev) => prev.filter((_, at) => at !== i))}
                  className="p-1 text-gray-400 hover:text-brand">
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
            <Button variant="outline" size="sm" className="gap-1.5"
              onClick={() => setComponents((prev) => [...prev, { type: "TUNJANGAN", name: "", amount: 0, code: null }])}>
              <Plus size={14} /> <T>Tambah Baris</T>
            </Button>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs"><T>Catatan</T></Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Misalnya kenaikan tahunan" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}><T>Batal</T></Button>
          <Button size="sm" onClick={save} disabled={isPending} className="gap-2">
            {isPending && <Loader2 size={14} className="animate-spin" />}
            <T>Simpan Penyesuaian</T>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function KaryawanDetailClient({
  employee: emp, tenure, managers, initialAction, initialTab, initialDate, pph21Years = [], priorSlips = [], canSeeLoans, loans, master, canSeePay, isSuper, isOwner = false, canEdit: canEditTarget,
  schedules, patterns, shiftDays, shiftOptions = [], overtimes = [], leaveBalances, payOptions, payComponents, self,
}: {
  employee: Employee;
  tenure: string | null;
  managers: { id: string; name: string; employeeId: string | null }[];
  initialAction?: string;
  initialTab?: string;
  initialDate?: string; // tanggal yang dibuka di kalender kehadiran (dari Laporan)
  pph21Years?: Pph21Year[]; // riwayat PPh 21 per tahun (tab PPh 21)
  priorSlips?: PriorSlipItem[]; // PPh 21 pindahan (tab Payroll)
  canSeeLoans: boolean;
  loans: LoanView[];
  master: MasterOptions;
  canSeePay: boolean;
  isSuper: boolean;
  isOwner?: boolean; // pucuk pimpinan: atasan langsung tampil "Owner"
  canEdit: boolean;
  schedules: ScheduleRow[];
  patterns: { id: string; name: string; cycleDays: number }[];
  shiftDays: Record<string, DayShift>;
  shiftOptions?: { id: string; code: string; name: string; color: string }[]; // palet shift Jadwal Manual
  overtimes?: { date: string; start: string; end: string; status: string }[];
  leaveBalances: BalanceRow[];
  payOptions: PayOption[];
  payComponents: PayComponentRow[];
  pendingEdits?: { id: string; requesterName: string; approverName: string; createdAt: string }[];
  // Profil Saya: halaman yang sama dilihat karyawan sendiri. Semua tombol ubah / aksi Admin disembunyikan,
  // bagian khusus Admin (Komponen Gaji, PPh 21 Pindahan) dilewati, ditambah tombol pengajuan & tab Akun.
  self?: { action: React.ReactNode; account: React.ReactNode };
}) {
  const t = useT();
  // canEditTarget: aturan siapa yang boleh diubah (dari server); ditambah hak Edit menu admin (hak lihat saja = tombol ubah disembunyikan).
  const canEditMenu = useCanEdit("karyawan");
  const canEditPay = useCanEdit("gaji");
  const canEditSchedule = useCanApply("absensi"); // tempel jadwal cukup hak lihat Absensi
  // Kartu shift di Kalender Kehadiran hanya aktif setelah dipicu dari kartu Jadwal Kerja (Jadwal Manual).
  const [placing, setPlacing] = useState(false);
  const canEdit = !self && canEditTarget && canEditMenu;
  // Hak "Ajukan": boleh membuka Edit data (Ubah Data saja); simpanan menjadi pengajuan ke atasan langsung si Admin.
  const canPropose = useCanPropose("karyawan");
  const proposeOnly = !self && canEditTarget && canPropose && !canEditMenu;
  const quick = canEdit ? QUICK_ACTIONS[initialAction ?? ""] : undefined;
  const [tab, setTab] = useState(() => {
    // PPh 21 bagian dari Slip & Pajak.
    const want = initialTab === "pph21" ? "payslip" : initialTab;
    return quick ? "pekerjaan" : want && TAB_LIST.some((x) => x.key === want) ? want : "pribadi";
  });
  const [editing, setEditing] = useState<Section | null>(quick?.section ?? null);
  const [mode, setMode] = useState<EditMode>(quick?.mode ?? "ubah");
  const [eventForm, setEventForm] = useState<Record<string, string>>({});
  const [salaryOpen, setSalaryOpen] = useState(false);
  const [familyOpen, setFamilyOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(initialAction === "history");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const tabs = [...TAB_LIST.filter(
    (t) => (t.key !== "payslip" || canSeePay) && (t.key !== "pinjaman" || canSeeLoans),
  ), ...(self ? [{ key: "akun", label: "Akun" }] : [])];
  // Mode Profil Saya: hak ubah / tempel jadwal / gaji dimatikan.
  const editTarget = !self && canEditTarget;

  const fields = useMemo<Record<Section, FormField[]>>(() => ({
    detail: [
      { key: "employeeId", label: "Employee ID *" },
      { key: "joinDate", label: "Tanggal Masuk", type: "date" },
      {
        key: "employmentStatus", label: "Status", type: "select",
        // Probation hanya muncul untuk data lama, supaya tidak berubah tanpa sengaja.
        options: Object.entries(STATUS_LABEL)
          .filter(([value]) => value !== "PROBATION" || emp.employmentStatus === "PROBATION")
          .map(([value, label]) => ({ value, label })),
      },
      { key: "contractEndDate", label: "Tanggal Akhir Kontrak", type: "date" },
      { key: "spkNumber", label: "No SPK" },
      { key: "spkDate", label: "Tanggal SPK", type: "date" },
    ],
    unit: [
      { key: "branch", label: "Cabang", type: "select", options: masterOptions(master.branches, emp.branch) },
      { key: "departmentName", label: "Departemen", type: "select", options: masterOptions(master.departments, emp.department?.name) },
      { key: "position", label: "Jabatan", type: "select", options: masterOptions(master.positions, emp.position) },
      {
        key: "managerEmployeeId", label: "Atasan Langsung (ID Karyawan)", type: "suggest",
        hint: "Isi ID Karyawan atasan langsung. Kosongkan kalau tidak punya atasan.",
        options: managers.flatMap((m) => (m.employeeId ? [{ value: m.employeeId, label: m.name }] : [])),
      },
    ],
    payroll: [
      {
        key: "paymentSchedule", label: "Payroll", type: "select",
        options: [
          { value: "", label: "—" },
          ...["Bulanan", "Mingguan", emp.paymentSchedule]
            .filter((value, i, all): value is string => !!value && all.indexOf(value) === i)
            .map((value) => ({ value, label: value })),
        ],
      },
    ],
    bank: [
      {
        key: "bankName", label: "Nama Bank", type: "suggest", options: BANK_OPTIONS,
        hint: "Pilih dari daftar, atau ketik sendiri kalau tidak ada. Pilih Cash bila gaji dibayar tunai.",
      },
      { key: "bankAccount", label: "No Rekening" },
      { key: "bankHolder", label: "Nama Pemilik Rekening" },
    ],
    pribadi: [
      { key: "name", label: "Nama Lengkap *" },
      { key: "phone", label: "Phone Number" },
      { key: "email", label: "Email", type: "email" },
      { key: "birthPlace", label: "Tempat Lahir" },
      { key: "birthDate", label: "Tanggal Lahir", type: "date" },
      {
        key: "idType", label: "Jenis ID", type: "select",
        options: [{ value: "", label: "—" }, ...ID_TYPES.map((value) => ({ value, label: value }))],
      },
      { key: "ktpNumber", label: "ID Number" },
      { key: "gender", label: "Jenis Kelamin", type: "select", options: masterOptions([...PERSONAL_CHOICES.gender], normalizeChoice("gender", emp.gender)) },
      { key: "maritalStatus", label: "Status Perkawinan", type: "select", options: masterOptions([...PERSONAL_CHOICES.maritalStatus], normalizeChoice("maritalStatus", emp.maritalStatus)) },
      { key: "religion", label: "Agama", type: "select", options: masterOptions([...PERSONAL_CHOICES.religion], normalizeChoice("religion", emp.religion)) },
      { key: "nationality", label: "Kewarganegaraan", type: "suggest", options: [{ value: "Indonesia", label: "" }] },
    ],
    alamat: [
      { key: "address", label: "Alamat sesuai Identitas (jalan, RT/RW)" },
      { key: "addressRegion", label: "Wilayah sesuai Identitas", type: "region", nameKey: "addressRegionName", postalKey: "addressPostal" },
      { key: "addressSameAsId", label: "Sama dengan alamat identitas", type: "check" },
      { key: "currentAddress", label: "Alamat Saat Ini (jalan, RT/RW)" },
      { key: "currentRegion", label: "Wilayah Alamat Saat Ini", type: "region", nameKey: "currentRegionName", postalKey: "currentPostal" },
    ],
    pajak: [
      { key: "npwp", label: "NPWP" },
      { key: "ptkpStatus", label: "Status PTKP", type: "select", options: masterOptions([...PTKP_STATUSES], emp.ptkpStatus) },
      { key: "taxability", label: "Metode Pajak (Taxability)", type: "select", options: ["Gross", "Gross Up", "Net"].map((v) => ({ value: v, label: v })) },
      { key: "taxStatus", label: "Status Pajak", type: "select", options: masterOptions([...TAX_STATUSES], emp.taxStatus) },
      {
        key: "taxObjectCode", label: "Kode Objek Pajak", type: "select",
        hint: "Diisi otomatis dari Status Pajak dan Jadwal Gajian; menentukan cara hitung PPh 21.",
        options: [{ value: "", label: "—" }, ...(emp.taxObjectCode && !TAX_OBJECT_CODES.some((c) => c.value === emp.taxObjectCode) ? [{ value: emp.taxObjectCode, label: emp.taxObjectCode }] : []), ...TAX_OBJECT_CODES.map((c) => ({ value: c.value, label: c.label }))],
      },
    ],
    bpjs: [
      { key: "bpjsTkNumber", label: "No BPJS Ketenagakerjaan" },
      { key: "bpjsTkActive", label: "Status BPJS Ketenagakerjaan", type: "select", options: FLAG_OPTIONS },
      { key: "bpjsKesNumber", label: "No BPJS Kesehatan" },
      { key: "bpjsKesActive", label: "Status BPJS Kesehatan", type: "select", options: FLAG_OPTIONS },
    ],
  }), [managers, master, emp.branch, emp.department, emp.position, emp.employmentStatus, emp.paymentSchedule, emp.gender, emp.maritalStatus, emp.religion, emp.ptkpStatus, emp.taxStatus, emp.taxObjectCode]);

  const [form, setForm] = useState<Record<string, string>>(() => (quick ? sectionValues(quick.section) : {}));

  const initials = emp.name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const today = new Date().toISOString().split("T")[0];
  const currentSalary = emp.salaries.find((s) => toInputDate(s.effectiveDate) <= today) ?? emp.salaries[0];
  const edit = (section: Section) => (canEdit || proposeOnly ? () => openEdit(section) : undefined);

  function sectionValues(section: Section) {
    const record = emp as unknown as Record<string, unknown>;
    const values: Record<string, string> = {};
    for (const field of fields[section]) {
      if (field.key === "departmentName") values[field.key] = emp.department?.name ?? "";
      else if (field.key === "managerEmployeeId") values[field.key] = emp.manager?.employeeId ?? "";
      else if (field.key in PERSONAL_CHOICES) values[field.key] = normalizeChoice(field.key as keyof typeof PERSONAL_CHOICES, record[field.key] as string | null);
      else if (field.type === "date") values[field.key] = toInputDate(record[field.key] as Date | null);
      else values[field.key] = String(record[field.key] ?? "");
      if (field.nameKey) values[field.nameKey] = String(record[field.nameKey] ?? "");
      if (field.postalKey) values[field.postalKey] = String(record[field.postalKey] ?? "");
    }
    return values;
  }

  function openEdit(section: Section) {
    setForm(sectionValues(section));
    setMode("ubah");
    setEventForm({});
    setError(null);
    setEditing(section);
  }

  function openQuick(key: string) {
    const action = QUICK_ACTIONS[key];
    setTab("pekerjaan");
    setForm(sectionValues(action.section));
    setMode(action.mode);
    setEventForm({});
    setError(null);
    setEditing(action.section);
  }

  function handleSave() {
    startTransition(async () => {
      try {
        const { effectiveDate = "", note } = eventForm;
        if (mode === "ubah") {
          const r = await updateEmployee(emp.id, form);
          if (r?.error) { setError(r.error); return; }
          // Pemberitahuan pop-up standar; pengajuan yang menunggu dipantau di Notifikasi.
          if (r?.proposed) void showNotice(`${t("Perubahan diajukan ke")} ${r.proposed}. ${t("Data baru berlaku setelah disetujui.")}`);
        }
        else if (mode === "TRANSFER") {
          const type = JOB_CHANGE_TYPE[eventForm.transferType ?? TRANSFER_TYPES[0]];
          await addJobChange(emp.id, { type, effectiveDate, note }, form);
        } else if (mode === "PEMBERHENTIAN") {
          const reason = [eventForm.stopType ?? STOP_TYPES[0], note?.trim()].filter(Boolean).join(": ");
          await addEmploymentEvent(emp.id, { type: mode, effectiveDate, reason });
        } else {
          await addEmploymentEvent(emp.id, { type: mode, effectiveDate, ...eventForm });
        }
        setEditing(null);
      } catch {
        setError(mode === "ubah"
          ? "Gagal menyimpan. ID Karyawan, email, atau No KTP mungkin sudah dipakai, atau ID atasan tidak ditemukan atau merupakan anak buahnya sendiri."
          : "Gagal menyimpan. Periksa tanggal dan isian wajib. Tanggal berhenti tidak boleh di masa depan, transfer harus mengubah isian, dan tanggal akhir kontrak harus setelah tanggal berlaku dan kontrak lama.");
      }
    });
  }

  async function handleReactivate() {
    if (!await askConfirm(t("Aktifkan kembali karyawan ini?"))) return;
    startTransition(async () => {
      await reactivateEmployee(emp.id);
    });
  }

  return (
    <div className="bg-gray-50 min-h-full">
      <main className="px-4 sm:px-6 py-5 max-w-6xl space-y-5">
        {self ? (
          <div>
            <h1 className="text-lg font-bold text-white"><T>Profil Saya</T></h1>
            <p className="text-xs text-white/70"><T>Data diri, pekerjaan, kehadiran, cuti, gaji, dan akun Anda.</T></p>
          </div>
        ) : (
          <nav className="flex items-center gap-1.5 text-sm font-medium text-white/80">
            <Link href="/portal/admin/karyawan" className="hover:text-white"><T>Data Karyawan</T></Link>
            <ChevronRight size={15} className="text-white/50" />
            <span className="text-white truncate">{emp.name}</span>
          </nav>
        )}

        {/* Kartu profil + ringkasan, mengikuti desain Code XR Dashboard v3 "My Profile". */}
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
          <div className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6">
            <div className="flex items-start gap-4">
              <span className="shrink-0 rounded-full bg-gradient-to-br from-amber-400 via-brand to-rose-400 p-[3px]">
                {emp.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={emp.image} alt={emp.name} className="h-20 w-20 rounded-full border-[3px] border-white object-cover" />
                ) : (
                  <span className="flex h-20 w-20 items-center justify-center rounded-full border-[3px] border-white bg-ink text-2xl font-bold text-white">
                    {initials}
                  </span>
                )}
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-xl font-bold leading-tight text-gray-900">{emp.name}</h2>
                <p className="mt-0.5 text-sm text-gray-500">{emp.position || "—"}</p>
                <p className="text-xs text-gray-400 truncate">{emp.department?.name}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Pill cls={emp.isActive
                    ? "bg-green-50 text-green-700 border-green-200"
                    : "bg-red-50 text-red-700 border-red-200"}>
                    {emp.isActive ? <T>{"Aktif"}</T> : <T>{"Nonaktif"}</T>}
                  </Pill>
                  <Pill cls="bg-gray-100 text-gray-700 border-gray-200">
                    <T>{STATUS_LABEL[emp.employmentStatus] ?? emp.employmentStatus}</T>
                  </Pill>
                </div>
              </div>
            </div>
            <div className="mt-5 flex items-center gap-2">
              <ContactButton href={emp.email ? `mailto:${emp.email}` : null} label="Email" dark>
                <Mail size={17} />
              </ContactButton>
              <ContactButton href={emp.phone ? `tel:${emp.phone}` : null} label="Telepon">
                <Phone size={17} />
              </ContactButton>
              <ContactButton href={waLink(emp.phone)} label="WhatsApp">
                <MessageCircle size={17} />
              </ContactButton>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <SummaryTile tone="amber" icon={Hash} label="Employee ID" value={emp.employeeId} />
            <SummaryTile
              tone="sky"
              icon={BriefcaseBusiness}
              label="Jabatan & Departemen"
              value={emp.position || "—"}
              sub={emp.department?.name ?? undefined}
            />
            <SummaryTile tone="rose" icon={Hourglass} label="Masa Kerja" value={tenure ?? "—"} />
            <SummaryTile
              tone="emerald"
              icon={UserRound}
              label="Atasan Langsung"
              value={emp.manager ? emp.manager.name : isOwner ? t("Owner") : "—"}
              sub={emp.manager?.employeeId ?? undefined}
            />
          </div>
        </div>

        {/* Tab berbentuk pil; tab aktif berwarna gelap supaya jelas terlihat. */}
        <div className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-2">
          <div role="tablist" className="no-scrollbar flex min-w-0 flex-1 gap-1 overflow-x-auto">
            {tabs.map((t) => (
              <button
                key={t.key}
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => setTab(t.key)}
                className={`h-9 shrink-0 rounded-full px-4 text-sm whitespace-nowrap transition-colors ${
                  tab === t.key
                    ? "bg-ink font-semibold text-white shadow-sm"
                    : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                }`}
              >
                <T>{t.label}</T>
              </button>
            ))}
          </div>
          {self ? self.action : <ActionMenu items={[
            ...(canEdit ? ACTION_ITEMS
              .filter((item) => emp.isActive || item.key !== "resign")
              .map((item) => ({ label: item.label, onClick: () => openQuick(item.key) })) : []),
            ...(canEdit && !emp.isActive
              ? [{ label: "Aktifkan Kembali", onClick: handleReactivate, disabled: isPending }]
              : []),
            { label: "History Perubahan", onClick: () => setHistoryOpen(true), separated: canEdit },
          ]} />}
        </div>

        {tab === "pekerjaan" && (
          <CvSheet sections={[
            { key: "detail", title: "Detail Pekerjaan", onEdit: edit("detail"), content: (<>
              <CvRow label="Employee ID">{emp.employeeId}</CvRow>
              <CvRow label="Tanggal Masuk">{emp.joinDate ? fmtDate(emp.joinDate) : null}</CvRow>
              <CvRow label="Status"><T>{STATUS_LABEL[emp.employmentStatus] ?? emp.employmentStatus}</T></CvRow>
              {emp.employmentStatus === "KONTRAK" && (
                <CvRow label="Tanggal Akhir Kontrak">{emp.contractEndDate ? fmtDate(emp.contractEndDate) : null}</CvRow>
              )}
              <CvRow label="No SPK">{emp.spkNumber}</CvRow>
              <CvRow label="Tanggal SPK">{emp.spkDate ? fmtDate(emp.spkDate) : null}</CvRow>
              <CvRow label="Masa Kerja">{tenure}</CvRow>
              {emp.resignDate && <CvRow label="Tanggal Berhenti">{fmtDate(emp.resignDate)}</CvRow>}
            </>) },
            { key: "unit", title: "Unit Perusahaan", onEdit: edit("unit"), content: (<>
              <CvRow label="Cabang">{emp.branch}</CvRow>
              <CvRow label="Departemen">{emp.department?.name}</CvRow>
              <CvRow label="Jabatan">{emp.position}</CvRow>
              <CvRow label="Atasan Langsung">
                {emp.manager ? [emp.manager.employeeId, emp.manager.name].filter(Boolean).join(" - ") : isOwner ? <T>Owner</T> : null}
              </CvRow>
            </>) },
            { key: "riwayat-kerja", title: "Riwayat Pekerjaan", flat: true, content: (<>
              {emp.employmentEvents.length === 0 ? (
                <p className="text-sm text-gray-400"><T>Belum ada riwayat pekerjaan.</T></p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead><T>Berlaku</T></TableHead>
                      <TableHead><T>Jenis</T></TableHead>
                      <TableHead><T>Keterangan</T></TableHead>
                      <TableHead className="hidden sm:table-cell"><T>Oleh</T></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {emp.employmentEvents.map((ev) => (
                      <TableRow key={ev.id}>
                        <TableCell className="text-sm whitespace-nowrap">{fmtDate(ev.effectiveDate)}</TableCell>
                        <TableCell className="text-sm whitespace-nowrap"><T>{EVENT_LABEL[ev.type] ?? ev.type}</T></TableCell>
                        <TableCell className="text-sm whitespace-normal">
                          {ev.type === "PERPANJANGAN"
                            ? `${t("Kontrak sampai")} ${fmtDate(ev.contractEndDate)}${ev.spkNumber ? ` · ${t("No SPK")} ${ev.spkNumber}` : ""}`
                            : ev.reason}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-sm">{ev.createdBy ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </>) },
          ]} />
        )}

        {tab === "gaji" && (
          <CvSheet sections={[
            canSeePay && { key: "payroll", title: "Payroll", onEdit: edit("payroll"), content: (<>
              <CvRow label="Jadwal Bayar">{emp.paymentSchedule ? <T>{emp.paymentSchedule}</T> : null}</CvRow>
              {emp.paymentSchedule === "Mingguan" && (
                <>
                  <CvRow label="Gaji Harian">{currentSalary?.dailyWage ? formatRupiah(currentSalary.dailyWage) : null}</CvRow>
                  <CvRow label="Pengali Bulanan">{currentSalary?.monthlyFactor ? `${currentSalary.monthlyFactor} x` : null}</CvRow>
                </>
              )}
              {/* Gaji harian & pengali tercatat di riwayat gaji, jadi diisi lewat Penyesuaian Gaji (bukan Edit Payroll). */}
              {emp.paymentSchedule === "Mingguan" && !currentSalary?.dailyWage && (
                <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                  <p className="min-w-0 flex-1 text-xs text-amber-800">
                    <T>Jadwal bayar Mingguan memakai Gaji Harian x Pengali Bulanan. Isi keduanya lewat Penyesuaian Gaji; sebelum diisi, gaji pokok mingguan dihitung Rp 0.</T>
                  </p>
                  {editTarget && canEditPay && (
                    <Button size="sm" onClick={() => setSalaryOpen(true)} className="h-8 px-3 text-xs"><T>Isi Gaji Harian</T></Button>
                  )}
                </div>
              )}
            </>) },
            canSeePay && { key: "gaji-kini", flat: true,
              title: currentSalary ? `${t("Gaji Saat Ini")} (${t("berlaku")} ${fmtDate(currentSalary.effectiveDate)})` : "Gaji Saat Ini",
              action: editTarget && canEditPay ? (
                <Button size="sm" onClick={() => setSalaryOpen(true)} className="h-7 px-3 text-xs">
                  <T>Penyesuaian Gaji</T>
                </Button>
              ) : undefined,
              content: currentSalary
                ? <div className="sm:pl-6 sm:max-w-xl"><SalaryCard salary={currentSalary} /></div>
                : <p className="text-sm text-gray-400"><T>Belum ada data gaji.</T></p> },
            canSeePay && !self && { key: "komponen", title: "Komponen Gaji", flat: true, content: <PayComponentsCard embedded userId={emp.id} rows={payComponents} joinDate={emp.joinDate ? new Date(emp.joinDate).toISOString().slice(0, 10) : null} /> },
            canSeePay && emp.salaries.length > 0 && { key: "riwayat-gaji", title: "Riwayat Gaji", flat: true, content: <SalaryHistory salaries={emp.salaries} currentId={currentSalary?.id} /> },
            { key: "pajak", title: "Pajak", onEdit: edit("pajak"), content: (<>
              <CvRow label="NPWP">{emp.npwp}</CvRow>
              <CvRow label="Status PTKP">{emp.ptkpStatus}</CvRow>
              <CvRow label="Metode Pajak (Taxability)">{emp.taxability ?? <span className="text-gray-400">Gross</span>}</CvRow>
              <CvRow label="Status Pajak">{emp.taxStatus}</CvRow>
              <CvRow label="Kode Objek Pajak">{emp.taxObjectCode}</CvRow>
            </>) },
            // Karyawan pindahan: data BPA1 pemberi kerja sebelumnya, diisi sekali.
            canSeePay && !self && { key: "pindahan", title: "PPh 21 Pindahan", flat: true, content: <PriorTaxCard embedded userId={emp.id} slips={priorSlips} /> },
            { key: "bpjs", title: "BPJS", onEdit: edit("bpjs"), content: (<>
              <CvRow label="No BPJS Ketenagakerjaan">{emp.bpjsTkNumber}</CvRow>
              <CvRow label="Status BPJS Ketenagakerjaan">{emp.bpjsTkActive ? <T>{"Ikut"}</T> : <T>{"Tidak Ikut"}</T>}</CvRow>
              <CvRow label="No BPJS Kesehatan">{emp.bpjsKesNumber}</CvRow>
              <CvRow label="Status BPJS Kesehatan">{emp.bpjsKesActive ? <T>{"Ikut"}</T> : <T>{"Tidak Ikut"}</T>}</CvRow>
            </>) },
          ]} />
        )}

        {tab === "pinjaman" && canSeeLoans && <ProfileLoans loans={loans} readOnly={!!self} />}

        {tab === "pribadi" && (
          <CvSheet sections={[
            { key: "pribadi", title: "Data Pribadi", onEdit: edit("pribadi"), content: (<>
              <CvRow label="Nama Lengkap">{emp.name}</CvRow>
              <CvRow label="Tempat Lahir">{emp.birthPlace}</CvRow>
              <CvRow label="Tanggal Lahir">{emp.birthDate ? fmtDate(emp.birthDate) : null}</CvRow>
              <CvRow label="Jenis Kelamin">{emp.gender && normalizeChoice("gender", emp.gender)}</CvRow>
              <CvRow label="Agama">{emp.religion && normalizeChoice("religion", emp.religion)}</CvRow>
              <CvRow label="Status Perkawinan">{emp.maritalStatus && normalizeChoice("maritalStatus", emp.maritalStatus)}</CvRow>
              <CvRow label="Kewarganegaraan">{emp.nationality}</CvRow>
              <CvRow label="Jenis ID">{emp.idType ? <T>{emp.idType}</T> : null}</CvRow>
              <CvRow label="ID Number">{emp.ktpNumber}</CvRow>
              <CvRow label="Phone Number">{emp.phone}</CvRow>
              <CvRow label="Email">{emp.email}</CvRow>
            </>) },
            { key: "alamat", title: "Alamat", onEdit: edit("alamat"), content: (<>
              <CvRow label="Alamat sesuai Identitas">{[emp.address, emp.addressRegionName, emp.addressPostal].filter(Boolean).join(", ") || null}</CvRow>
              <CvRow label="Alamat Saat Ini">{(emp.addressSameAsId ? [emp.address, emp.addressRegionName, emp.addressPostal] : [emp.currentAddress, emp.currentRegionName, emp.currentPostal]).filter(Boolean).join(", ") || null}</CvRow>
            </>) },
            { key: "keluarga", title: "Keluarga", onEdit: canEdit ? () => setFamilyOpen(true) : undefined, content: (
              emp.family.length === 0
                ? <p className="text-sm text-gray-400"><T>Belum ada data keluarga.</T></p>
                : <>{emp.family.map((f) => (
                    <CvRow key={f.id} label={f.relation}>
                      {f.name}{f.idNumber ? <span className="font-normal text-gray-500"> · {f.idNumber}</span> : null}
                    </CvRow>
                  ))}</>
            ) },
            { key: "bank", title: "Rekening Bank", onEdit: edit("bank"), content: (<>
              <CvRow label="Nama Bank">{emp.bankName}</CvRow>
              <CvRow label="No Rekening">{emp.bankAccount}</CvRow>
              <CvRow label="Nama Pemilik Rekening">{emp.bankHolder}</CvRow>
            </>) },
          ]} />
        )}

        {tab === "absensi" && (
          <div className="space-y-4">
            {/* Kalender & jadwal sengaja tidak diubah: bentuknya sudah pas dengan kartu kehadiran (permintaan pemilik). */}
          <AttendanceCalendar initialDate={initialDate} attendances={emp.attendances} leaves={emp.leaves} trips={emp.businessTrips} shiftDays={shiftDays} overtimes={overtimes} editUserId={isSuper && !self ? emp.id : undefined}
            shiftEdit={editTarget && canEditSchedule && placing ? { userId: emp.id, shifts: shiftOptions, onDone: () => setPlacing(false) } : undefined}
            side={<ScheduleCard userId={emp.id} schedules={schedules} patterns={patterns} canEdit={editTarget && canEditSchedule} placing={placing} onPlace={() => setPlacing(true)} exempt={!!emp.attendanceExempt} canExempt={isSuper && !self} />} />
          </div>
        )}

        {/* Riwayat Absensi harian dihapus dari profil: sudah terlihat di kalender (keputusan pemilik 2026-11-21). */}
        {tab === "cuti" && (
            <CvSheet sections={[
              { key: "saldo", title: "Saldo Cuti", flat: true, content: <LeaveSaldo rows={leaveBalances} leaves={emp.leaves} /> },
              { key: "dinas", title: "Riwayat Dinas Luar", flat: true, content: (<>
          {emp.businessTrips.length === 0 ? <Empty text="Belum ada pengajuan dinas luar." /> : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50/60 hover:bg-gray-50/60">
                    <TableHead className="px-4"><T>Periode</T></TableHead>
                    <TableHead className="px-4"><T>Tujuan</T></TableHead>
                    <TableHead className="px-4"><T>Hari</T></TableHead>
                    <TableHead className="hidden md:table-cell px-4"><T>Keperluan</T></TableHead>
                    <TableHead className="px-4"><T>Status</T></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {emp.businessTrips.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="px-4 text-sm whitespace-nowrap">{fmtDate(t.startDate)} – {fmtDate(t.endDate)}</TableCell>
                      <TableCell className="px-4 text-sm">{t.destination}</TableCell>
                      <TableCell className="px-4 text-sm">{t.totalDays}</TableCell>
                      <TableCell className="hidden md:table-cell px-4 text-xs text-gray-500 max-w-xs truncate">{t.purpose}</TableCell>
                      <TableCell className="px-4">
                        <Pill cls={APPROVAL[t.status]?.cls ?? ""}><T>{APPROVAL[t.status]?.label ?? t.status}</T></Pill>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
              </>) },
            ]} />
        )}


        {tab === "akun" && self?.account}

        {tab === "payslip" && canSeePay && (
          <CvSheet initial={initialTab === "pph21" ? "pph21" : undefined} sections={[
            { key: "slip", title: "Slip Gaji", flat: true, content: (
          emp.payslips.length === 0 ? <Empty text="Belum ada slip gaji." /> : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50/60 hover:bg-gray-50/60">
                    <TableHead className="px-4"><T>Periode</T></TableHead>
                    <TableHead className="px-4 text-right"><T>Gaji Bersih</T></TableHead>
                    <TableHead className="hidden sm:table-cell px-4"><T>Dibayar</T></TableHead>
                    <TableHead className="hidden md:table-cell px-4"><T>Via</T></TableHead>
                    <TableHead className="px-4 text-right"><T>Slip</T></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {emp.payslips.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="px-4 text-sm">{p.periodLabel}</TableCell>
                      <TableCell className="px-4 text-sm text-right tabular-nums">{formatRupiah(p.netPay)}</TableCell>
                      <TableCell className="hidden sm:table-cell px-4 text-sm">{fmtDate(p.paidAt)}</TableCell>
                      <TableCell className="hidden md:table-cell px-4 text-xs text-gray-500">{p.paidVia ?? "—"}</TableCell>
                      <TableCell className="px-4 text-right"><a href={`/api/payslip/${p.id}?unduh=1`} className="text-xs font-semibold text-brand hover:underline">PDF</a></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )
            ) },
            { key: "pph21", title: "PPh 21", flat: true, content: <Pph21Card userId={emp.id} years={pph21Years} /> },
          ]} />
        )}

      </main>

      {familyOpen && <FamilyDialog employee={emp} onClose={() => setFamilyOpen(false)} />}
      {historyOpen && <ChangeHistoryDialog logs={emp.changeLogs} onClose={() => setHistoryOpen(false)} />}

      {canSeePay && salaryOpen && (
        <SalaryDialog payOptions={payOptions} employee={emp} current={currentSalary} open={salaryOpen} onClose={() => setSalaryOpen(false)} />
      )}

      <Dialog open={editing !== null} onOpenChange={(open: boolean) => { if (!open) setEditing(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? `${t("Edit")} ${t(SECTION_TITLE[editing])}` : ""}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-1">
            {error && <div className="text-sm px-4 py-3 rounded-lg bg-red-50 text-red-700">{error}</div>}
            {proposeOnly && (
              <div className="rounded-lg bg-amber-50 px-4 py-3 text-xs text-amber-800">
                <T>Perubahan ini memerlukan persetujuan dan baru berlaku setelah disetujui oleh atasan karyawan yang bersangkutan sesuai struktur organisasi.</T>
              </div>
            )}
            {editing && canEdit && EDIT_MODES[editing] && (
              <div className="flex flex-wrap gap-2">
                {EDIT_MODES[editing].map((key) => (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={mode === key}
                    disabled={(key === "PERPANJANGAN" && emp.employmentStatus !== "KONTRAK")
                      || (key === "PEMBERHENTIAN" && !emp.isActive)}
                    onClick={() => { setMode(key); setEventForm({}); setError(null); }}
                    className={`flex-1 whitespace-nowrap rounded-lg border px-3 py-2 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                      mode === key ? MODE_COLOR[key].active : MODE_COLOR[key].idle
                    }`}
                  >
                    <T>{key === "ubah" ? "Ubah Data" : EVENT_LABEL[key]}</T>
                  </button>
                ))}
              </div>
            )}
            {editing === "unit" && mode === "ubah" && (
              <p className="text-xs text-gray-500">
                <T>Pilih Transfer lalu ubah isian di bawah supaya tercatat di Riwayat Pekerjaan.</T>
              </p>
            )}
            {EVENT_FIELDS[mode]?.map((field) => (
              <div key={field.key} className="space-y-1.5">
                <Label htmlFor={`event-${field.key}`} className="text-xs"><T>{field.label}</T></Label>
                {field.options ? (
                  <select
                    id={`event-${field.key}`}
                    value={eventForm[field.key] ?? field.options[0]}
                    onChange={(e) => setEventForm((f) => ({ ...f, [field.key]: e.target.value }))}
                    className="h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm"
                  >
                    {field.options.map((o) => <option key={o} value={o}><T>{o}</T></option>)}
                  </select>
                ) : (
                  <Input
                    id={`event-${field.key}`}
                    type={field.type}
                    value={eventForm[field.key] ?? ""}
                    onChange={(e) => setEventForm((f) => ({ ...f, [field.key]: e.target.value }))}
                  />
                )}
              </div>
            ))}
            {mode === "PEMBERHENTIAN" && (
              <p className="text-xs text-gray-500">
                <T>Karyawan langsung dinonaktifkan dan tidak bisa login. Tanggal berhenti tidak boleh di masa depan.</T>
              </p>
            )}
            {(mode === "ubah" || mode === "TRANSFER") && editing && fields[editing].map((field) => field.type === "check" ? (
              <label key={field.key} className="flex items-center gap-2 text-sm text-gray-800">
                <input
                  type="checkbox"
                  className="accent-[var(--color-brand)] w-4 h-4"
                  checked={form[field.key] === "true"}
                  onChange={(e) => setForm((f) => ({ ...f, [field.key]: String(e.target.checked) }))}
                />
                <T>{field.label}</T>
              </label>
            ) : field.type === "region" ? (
              (field.key === "currentRegion" && form.addressSameAsId === "true") ? null : (
                <RegionSelect key={field.key} label={field.label} value={form[field.key] ?? ""}
                  postal={field.postalKey ? form[field.postalKey] ?? "" : undefined}
                  onPostalChange={field.postalKey ? (v) => setForm((f) => ({ ...f, [field.postalKey!]: v })) : undefined}
                  onChange={(code, name, postal) => setForm((f) => ({ ...f, [field.key]: code, [field.nameKey ?? `${field.key}Name`]: name, ...(field.postalKey ? { [field.postalKey]: postal } : {}) }))} />
              )
            ) : (field.key === "currentAddress" && form.addressSameAsId === "true")
              || (field.key === "contractEndDate" && form.employmentStatus !== "KONTRAK") ? null : (
              <div key={field.key} className="space-y-1.5">
                <Label htmlFor={field.key} className="text-xs"><T>{field.label}</T></Label>
                {field.type === "select" ? (
                  <select
                    id={field.key}
                    value={form[field.key] ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))}
                    className="h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm"
                  >
                    {field.options?.map((o) => <option key={o.value} value={o.value}><T>{o.label}</T></option>)}
                  </select>
                ) : field.type === "suggest" ? (
                  <EmployeeCombobox
                    id={field.key}
                    value={form[field.key] ?? ""}
                    options={field.options ?? []}
                    onChange={(value) => setForm((f) => ({
                      ...f, [field.key]: value,
                      // Cash: nomor & nama rekening dikosongkan (dikunci di bawah).
                      ...(field.key === "bankName" && isCashBank(value) ? { bankAccount: "", bankHolder: "" } : {}),
                    }))}
                  />
                ) : (field.key === "bankAccount" || field.key === "bankHolder") && isCashBank(form.bankName) ? (
                  <Input id={field.key} value="" disabled placeholder={t("Tidak diisi (dibayar Cash)")} />
                ) : (
                  <Input
                    id={field.key}
                    type={field.type ?? "text"}
                    value={form[field.key] ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))}
                  />
                )}
                {field.hint && <p className="text-xs text-gray-500"><T>{field.hint}</T></p>}
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEditing(null)}><T>Batal</T></Button>
            <Button size="sm" onClick={handleSave} disabled={isPending} className="gap-2">
              {isPending && <Loader2 size={14} className="animate-spin" />}
              <T>Simpan Perubahan</T>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
