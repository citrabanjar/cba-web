"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  BadgeCheck, BriefcaseBusiness, Building2, Cake, CalendarClock, CalendarDays, CalendarX, ChevronDown,
  ChevronRight, CreditCard, FileText, Hash, Heart, History, Home, Hourglass, IdCard, KeyRound, Landmark,
  Loader2, Mail, MapPin, MessageCircle, Network, Pencil, Phone, Plus, Receipt, ShieldCheck, Sparkles,
  Trash2, UserRound, Users,
} from "lucide-react";
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
import { MENUS } from "@/lib/roles";
import type { MasterOptions } from "@/lib/master-data";
import { BANK_OPTIONS, FAMILY_RELATIONS, ID_TYPES, PERSONAL_LOG_LABELS, WORK_LOG_LABELS } from "@/lib/personal-info";
import {
  addEmploymentEvent, addJobChange, addSalaryAdjustment, reactivateEmployee, saveFamily, setEmployeeAccess, updateEmployee,
} from "../actions";
import { T, useT } from "@/components/i18n";
import AttendanceCalendar from "./AttendanceCalendar";
import ScheduleCard, { type ScheduleRow } from "./ScheduleCard";
import type { DayShift } from "@/lib/schedule";
import type { BalanceRow } from "@/lib/leave-balance";
import LeaveBalanceCard from "@/components/portal/LeaveBalanceCard";
import PayComponentsCard, { type PayComponentRow } from "./PayComponentsCard";

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
  isActive: boolean; idType: string | null; ktpNumber: string | null; address: string | null;
  currentAddress: string | null; addressSameAsId: boolean;
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
  type?: "date" | "email" | "select" | "suggest" | "check"; options?: Option[];
};
type Section = "detail" | "unit" | "bank" | "payroll" | "pribadi" | "alamat" | "pajak" | "bpjs";
type EditMode = "ubah" | "PERPANJANGAN" | "PEMBERHENTIAN" | "TRANSFER";
type Component = { type: "TUNJANGAN" | "POTONGAN"; name: string; amount: number; code: string | null };
type PayOption = { code: string; name: string; kind: string };
type FamilyRow = { name: string; idNumber: string; relation: string };

const TAB_LIST = [
  { key: "pribadi", label: "Personal Info" },
  { key: "pekerjaan", label: "Pekerjaan" },
  { key: "absensi", label: "Kehadiran & Shift" },
  { key: "cuti", label: "Cuti & Dinas" },
  { key: "gaji", label: "Payroll" },
  { key: "payslip", label: "Slip Gaji" },
  { key: "akses", label: "Akses" },
];

const STATUS_LABEL: Record<string, string> = {
  TETAP: "Tetap", KONTRAK: "Kontrak", PROBATION: "Probation",
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
const ATTENDANCE: Record<string, string> = {
  HADIR: "bg-green-50 text-green-700 border-green-200",
  IZIN: "bg-blue-50 text-blue-700 border-blue-200",
  SAKIT: "bg-amber-50 text-amber-700 border-amber-200",
  ALPHA: "bg-red-50 text-red-700 border-red-200",
  CUTI: "bg-purple-50 text-purple-700 border-purple-200",
  DINAS: "bg-sky-50 text-sky-700 border-sky-200",
};

// Kolom @db.Date tersimpan tengah malam UTC, jadi tampilkan dalam UTC.
// Zona waktu ditulis eksplisit supaya hasil server dan browser sama.
function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return formatDate(d);
}
function fmtTime(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleTimeString("id-ID", {
    hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta",
  });
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

// Ikon judul kartu, warnanya mengikuti urutan kartu di dalam tab (lihat .section-stack di globals.css).
const SECTION_ICON: Record<string, React.ElementType> = {
  "Data Pribadi": UserRound, "Tempat Tinggal": Home, "Keluarga": Users, "Rekening Bank": Landmark,
  "Detail Pekerjaan": BriefcaseBusiness, "Unit Perusahaan": Building2, "Riwayat Pekerjaan": History,
  "Payroll": CalendarClock, "Pajak": Receipt, "BPJS": ShieldCheck, "Akses Portal": KeyRound,
};

// Kartu bagian bergaya Code XR Dashboard v3: judul dengan ikon berwarna dan tombol Edit berbentuk pil.
// `grid` menyusun isian sebagai kotak-kotak kecil; tanpa `grid` isinya bebas (tabel, dll).
function SectionCard({
  title, onEdit, action, grid = false, children,
}: {
  title: string; onEdit?: () => void; action?: React.ReactNode; grid?: boolean; children: React.ReactNode;
}) {
  const Icon = SECTION_ICON[title] ?? FileText;
  return (
    <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="section-head flex items-center justify-between gap-3 px-5 py-4">
        <div className="flex items-center gap-3 min-w-0">
          <span className="section-icon"><Icon size={17} /></span>
          <h3 className="font-semibold text-[15px] truncate"><T>{title}</T></h3>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {action}
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex h-8 items-center gap-1.5 rounded-full bg-ink px-4 text-xs font-semibold text-white transition-colors hover:bg-ink/85"
            >
              <Pencil size={13} /> <T>Edit</T>
            </button>
          )}
        </div>
      </div>
      <dl className={grid ? "grid grid-cols-1 gap-3 p-5 sm:grid-cols-2 xl:grid-cols-3" : "px-5 pb-4"}>{children}</dl>
    </section>
  );
}

// Ikon tiap isian supaya kotaknya mudah dikenali.
const FIELD_ICON: Record<string, React.ElementType> = {
  "Nama Lengkap": UserRound, "Phone Number": Phone, "Email": Mail, "Tempat Lahir": MapPin,
  "Tanggal Lahir": Cake, "Jenis ID": IdCard, "ID Number": IdCard, "Jenis Kelamin": UserRound,
  "Status Perkawinan": Heart, "Agama": Sparkles, "Alamat sesuai Identitas": Home, "Alamat Saat Ini": MapPin,
  "Nama Bank": Landmark, "No Rekening": CreditCard, "Nama Pemilik Rekening": UserRound,
  "Employee ID": Hash, "Tanggal Masuk": CalendarDays, "Status": BadgeCheck, "Tanggal Akhir Kontrak": CalendarX,
  "No SPK": FileText, "Tanggal SPK": CalendarDays, "Masa Kerja": Hourglass, "Tanggal Berhenti": CalendarX,
  "Cabang": Building2, "Departemen": Network, "Jabatan": BriefcaseBusiness, "Atasan Langsung": UserRound,
  "Payroll": CalendarClock, "NPWP": Receipt, "Status PTKP": Receipt, "Taxability": Receipt,
  "Status Pajak": Receipt, "Kode Objek Pajak": Hash,
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const Icon = FIELD_ICON[label] ?? (label.includes("BPJS") ? ShieldCheck : FileText);
  return (
    <div className="flex items-start gap-3 rounded-xl border border-gray-100 bg-gray-50/70 px-4 py-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-gray-500 shadow-sm ring-1 ring-gray-200">
        <Icon size={15} />
      </span>
      <div className="min-w-0">
        <dt className="text-[11px] font-medium uppercase tracking-wide text-gray-400"><T>{label}</T></dt>
        <dd className="mt-0.5 text-sm font-semibold text-gray-900 break-words">{children || "—"}</dd>
      </div>
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
              <Input value={r.name} placeholder="Nama" aria-label="Nama"
                onChange={(e) => patch(i, { name: e.target.value })} />
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

function AccessPanel({ employee }: { employee: Employee }) {
  const [isAdmin, setIsAdmin] = useState(employee.role === "ADMIN");
  const [menus, setMenus] = useState<string[]>(employee.menuAccess);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      await setEmployeeAccess(employee.id, isAdmin ? "ADMIN" : "KARYAWAN", menus);
      setMessage("Akses tersimpan dan langsung berlaku.");
    });
  }

  return (
    <SectionCard title="Akses Portal">
      <div className="space-y-4 py-2">
        <label className="flex items-center gap-3 text-sm text-gray-800">
          <input type="checkbox" checked={isAdmin} className="accent-[var(--color-brand)] w-4 h-4"
            onChange={(e) => { setIsAdmin(e.target.checked); setMessage(null); }} />
          <T>Jadikan Admin</T>
        </label>
        {isAdmin && (
          <div className="space-y-2 pl-7">
            <p className="text-xs text-gray-500"><T>Pilih menu yang boleh dibuka:</T></p>
            {MENUS.map((menu) => (
              <label key={menu.key} className="flex items-start gap-3 text-sm text-gray-800">
                <input type="checkbox" className="accent-[var(--color-brand)] w-4 h-4 mt-0.5"
                  checked={menus.includes(menu.key)}
                  onChange={(e) => {
                    setMessage(null);
                    setMenus((prev) => e.target.checked
                      ? [...prev, menu.key]
                      : prev.filter((m) => m !== menu.key));
                  }} />
                <span>
                  <T>{menu.label}</T>
                  <span className="block text-xs text-gray-500"><T>{menu.desc}</T></span>
                </span>
              </label>
            ))}
          </div>
        )}
        {message && <p className="text-sm text-green-700">{message}</p>}
        <Button size="sm" onClick={save} disabled={isPending} className="gap-2">
          {isPending && <Loader2 size={14} className="animate-spin" />}
          <T>Simpan Akses</T>
        </Button>
      </div>
    </SectionCard>
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
        await addSalaryAdjustment(employee.id, {
          effectiveDate,
          basicSalary: harian ? monthlyEq : Number(basicSalary),
          dailyWage: harian ? Number(dailyWage) : null,
          monthlyFactor: harian ? Number(monthlyFactor) : null,
          bpjsTkBase: current?.bpjsTkBase ?? undefined,
          bpjsKesBase: current?.bpjsKesBase ?? undefined,
          note,
          components: components.filter((c) => c.name.trim() && c.amount > 0),
        });
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
            <p className="text-[11px] text-gray-400"><T>Pilih dari komponen di Payroll & Benefit supaya sifat pajak dan dasar hitungnya ikut aturan komponen.</T></p>
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
  employee: emp, tenure, managers, initialAction, master, canSeePay, isSuper, canEdit,
  schedules, patterns, shiftDays, leaveBalances, payOptions, payComponents,
}: {
  employee: Employee;
  tenure: string | null;
  managers: { id: string; name: string; employeeId: string | null }[];
  initialAction?: string;
  master: MasterOptions;
  canSeePay: boolean;
  isSuper: boolean;
  canEdit: boolean;
  schedules: ScheduleRow[];
  patterns: { id: string; name: string; cycleDays: number }[];
  shiftDays: Record<string, DayShift>;
  leaveBalances: BalanceRow[];
  payOptions: PayOption[];
  payComponents: PayComponentRow[];
}) {
  const t = useT();
  const quick = canEdit ? QUICK_ACTIONS[initialAction ?? ""] : undefined;
  const [tab, setTab] = useState(quick ? "pekerjaan" : "pribadi");
  const [editing, setEditing] = useState<Section | null>(quick?.section ?? null);
  const [mode, setMode] = useState<EditMode>(quick?.mode ?? "ubah");
  const [eventForm, setEventForm] = useState<Record<string, string>>({});
  const [salaryOpen, setSalaryOpen] = useState(false);
  const [familyOpen, setFamilyOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(initialAction === "history");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const tabs = TAB_LIST.filter(
    (t) => (t.key !== "payslip" || canSeePay) && (t.key !== "akses" || isSuper),
  );

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
        hint: "Pilih dari daftar, atau ketik sendiri kalau tidak ada.",
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
      { key: "gender", label: "Jenis Kelamin" },
      { key: "maritalStatus", label: "Status Perkawinan" },
      { key: "religion", label: "Agama" },
    ],
    alamat: [
      { key: "address", label: "Alamat sesuai Identitas" },
      { key: "addressSameAsId", label: "Sama dengan alamat identitas", type: "check" },
      { key: "currentAddress", label: "Alamat Saat Ini" },
    ],
    pajak: [
      { key: "npwp", label: "NPWP" },
      { key: "ptkpStatus", label: "Status PTKP" },
      { key: "taxability", label: "Taxability" },
      { key: "taxStatus", label: "Status Pajak" },
      { key: "taxObjectCode", label: "Kode Objek Pajak" },
    ],
    bpjs: [
      { key: "bpjsTkNumber", label: "No BPJS Ketenagakerjaan" },
      { key: "bpjsTkActive", label: "Status BPJS Ketenagakerjaan", type: "select", options: FLAG_OPTIONS },
      { key: "bpjsKesNumber", label: "No BPJS Kesehatan" },
      { key: "bpjsKesActive", label: "Status BPJS Kesehatan", type: "select", options: FLAG_OPTIONS },
    ],
  }), [managers, master, emp.branch, emp.department, emp.position, emp.employmentStatus, emp.paymentSchedule]);

  const [form, setForm] = useState<Record<string, string>>(() => (quick ? sectionValues(quick.section) : {}));

  const initials = emp.name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const today = new Date().toISOString().split("T")[0];
  const currentSalary = emp.salaries.find((s) => toInputDate(s.effectiveDate) <= today) ?? emp.salaries[0];
  const edit = (section: Section) => (canEdit ? () => openEdit(section) : undefined);

  function sectionValues(section: Section) {
    const record = emp as unknown as Record<string, unknown>;
    const values: Record<string, string> = {};
    for (const field of fields[section]) {
      if (field.key === "departmentName") values[field.key] = emp.department?.name ?? "";
      else if (field.key === "managerEmployeeId") values[field.key] = emp.manager?.employeeId ?? "";
      else if (field.type === "date") values[field.key] = toInputDate(record[field.key] as Date | null);
      else values[field.key] = String(record[field.key] ?? "");
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
        if (mode === "ubah") await updateEmployee(emp.id, form);
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

  function handleReactivate() {
    if (!window.confirm(t("Aktifkan kembali karyawan ini?"))) return;
    startTransition(async () => {
      await reactivateEmployee(emp.id);
    });
  }

  return (
    <div className="bg-gray-50 min-h-full">
      <main className="px-4 sm:px-6 py-5 max-w-6xl space-y-5">
        <nav className="flex items-center gap-1.5 text-sm font-medium text-white/80">
          <Link href="/portal/admin/karyawan" className="hover:text-white"><T>Data Karyawan</T></Link>
          <ChevronRight size={15} className="text-white/50" />
          <span className="text-white truncate">{emp.name}</span>
        </nav>

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
              <span className="ml-auto truncate text-xs text-gray-400">{emp.email ?? emp.phone ?? ""}</span>
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
              value={emp.manager ? emp.manager.name : "—"}
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
          <ActionMenu items={[
            ...(canEdit ? ACTION_ITEMS
              .filter((item) => emp.isActive || item.key !== "resign")
              .map((item) => ({ label: item.label, onClick: () => openQuick(item.key) })) : []),
            ...(canEdit && !emp.isActive
              ? [{ label: "Aktifkan Kembali", onClick: handleReactivate, disabled: isPending }]
              : []),
            { label: "History Perubahan", onClick: () => setHistoryOpen(true), separated: canEdit },
          ]} />
        </div>

        {tab === "pekerjaan" && (
          <div className="section-stack space-y-5">
            <SectionCard title="Detail Pekerjaan" onEdit={edit("detail")} grid>
              <Field label="Employee ID">{emp.employeeId}</Field>
              <Field label="Tanggal Masuk">{emp.joinDate ? fmtDate(emp.joinDate) : null}</Field>
              <Field label="Status"><T>{STATUS_LABEL[emp.employmentStatus] ?? emp.employmentStatus}</T></Field>
              {emp.employmentStatus === "KONTRAK" && (
                <Field label="Tanggal Akhir Kontrak">{emp.contractEndDate ? fmtDate(emp.contractEndDate) : null}</Field>
              )}
              <Field label="No SPK">{emp.spkNumber}</Field>
              <Field label="Tanggal SPK">{emp.spkDate ? fmtDate(emp.spkDate) : null}</Field>
              <Field label="Masa Kerja">{tenure}</Field>
              {emp.resignDate && <Field label="Tanggal Berhenti">{fmtDate(emp.resignDate)}</Field>}
            </SectionCard>

            <SectionCard title="Unit Perusahaan" onEdit={edit("unit")} grid>
              <Field label="Cabang">{emp.branch}</Field>
              <Field label="Departemen">{emp.department?.name}</Field>
              <Field label="Jabatan">{emp.position}</Field>
              <Field label="Atasan Langsung">
                {emp.manager ? [emp.manager.employeeId, emp.manager.name].filter(Boolean).join(" - ") : null}
              </Field>
            </SectionCard>

            <SectionCard title="Riwayat Pekerjaan">
              {emp.employmentEvents.length === 0 ? (
                <p className="py-4 text-sm text-gray-400"><T>Belum ada riwayat pekerjaan.</T></p>
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
            </SectionCard>
          </div>
        )}

        {tab === "gaji" && (
          <div className="section-stack space-y-5">
            {canSeePay && (
              <SectionCard title="Payroll" onEdit={edit("payroll")} grid>
                <Field label="Jadwal Bayar">{emp.paymentSchedule ? <T>{emp.paymentSchedule}</T> : null}</Field>
                {emp.paymentSchedule === "Mingguan" && (
                  <>
                    <Field label="Gaji Harian">{currentSalary?.dailyWage ? formatRupiah(currentSalary.dailyWage) : null}</Field>
                    <Field label="Pengali Bulanan">{currentSalary?.monthlyFactor ? `${currentSalary.monthlyFactor} x` : null}</Field>
                  </>
                )}
              </SectionCard>
            )}
            <SectionCard title="Pajak" onEdit={edit("pajak")} grid>
              <Field label="NPWP">{emp.npwp}</Field>
              <Field label="Status PTKP">{emp.ptkpStatus}</Field>
              <Field label="Taxability">{emp.taxability}</Field>
              <Field label="Status Pajak">{emp.taxStatus}</Field>
              <Field label="Kode Objek Pajak">{emp.taxObjectCode}</Field>
            </SectionCard>
            <SectionCard title="BPJS" onEdit={edit("bpjs")} grid>
              <Field label="No BPJS Ketenagakerjaan">{emp.bpjsTkNumber}</Field>
              <Field label="Status BPJS Ketenagakerjaan">{emp.bpjsTkActive ? <T>{"Ikut"}</T> : <T>{"Tidak Ikut"}</T>}</Field>
              {canSeePay && (
                <Field label="Dasar Upah BPJS Ketenagakerjaan">
                  {currentSalary?.bpjsTkBase ? formatRupiah(currentSalary.bpjsTkBase) : null}
                </Field>
              )}
              <Field label="No BPJS Kesehatan">{emp.bpjsKesNumber}</Field>
              <Field label="Status BPJS Kesehatan">{emp.bpjsKesActive ? <T>{"Ikut"}</T> : <T>{"Tidak Ikut"}</T>}</Field>
            </SectionCard>
            {canSeePay && (<>

            <SectionCard
              title={currentSalary ? `${t("Gaji Saat Ini")} (${t("berlaku")} ${fmtDate(currentSalary.effectiveDate)})` : "Gaji Saat Ini"}
              action={
                <Button size="sm" onClick={() => setSalaryOpen(true)} className="h-7 px-3 text-xs">
                  <T>Penyesuaian Gaji</T>
                </Button>
              }
            >
              {currentSalary
                ? <SalaryCard salary={currentSalary} />
                : <p className="py-4 text-sm text-gray-400"><T>Belum ada data gaji.</T></p>}
            </SectionCard>

            <PayComponentsCard userId={emp.id} rows={payComponents} />

            {emp.salaries.length > 0 && <SalaryHistory salaries={emp.salaries} currentId={currentSalary?.id} />}
            </>)}
          </div>
        )}

        {tab === "pribadi" && (
          <div className="section-stack space-y-5">
            <SectionCard title="Data Pribadi" onEdit={edit("pribadi")} grid>
              <Field label="Nama Lengkap">{emp.name}</Field>
              <Field label="Phone Number">{emp.phone}</Field>
              <Field label="Email">{emp.email}</Field>
              <Field label="Tempat Lahir">{emp.birthPlace}</Field>
              <Field label="Tanggal Lahir">{emp.birthDate ? fmtDate(emp.birthDate) : null}</Field>
              <Field label="Jenis ID">{emp.idType ? <T>{emp.idType}</T> : null}</Field>
              <Field label="ID Number">{emp.ktpNumber}</Field>
              <Field label="Jenis Kelamin">{emp.gender}</Field>
              <Field label="Status Perkawinan">{emp.maritalStatus}</Field>
              <Field label="Agama">{emp.religion}</Field>
            </SectionCard>

            <SectionCard title="Tempat Tinggal" onEdit={edit("alamat")} grid>
              <Field label="Alamat sesuai Identitas">{emp.address}</Field>
              <Field label="Alamat Saat Ini">{emp.addressSameAsId ? emp.address : emp.currentAddress}</Field>
            </SectionCard>

            <SectionCard title="Keluarga" onEdit={canEdit ? () => setFamilyOpen(true) : undefined}>
              {emp.family.length === 0 ? (
                <p className="py-4 text-sm text-gray-400"><T>Belum ada data keluarga.</T></p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead><T>Nama</T></TableHead>
                      <TableHead><T>ID Number</T></TableHead>
                      <TableHead><T>Jenis Anggota Keluarga</T></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {emp.family.map((f) => (
                      <TableRow key={f.id}>
                        <TableCell className="text-sm">{f.name}</TableCell>
                        <TableCell className="text-sm">{f.idNumber ?? "—"}</TableCell>
                        <TableCell className="text-sm"><T>{f.relation}</T></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </SectionCard>

            <SectionCard title="Rekening Bank" onEdit={edit("bank")} grid>
              <Field label="Nama Bank">{emp.bankName}</Field>
              <Field label="No Rekening">{emp.bankAccount}</Field>
              <Field label="Nama Pemilik Rekening">{emp.bankHolder}</Field>
            </SectionCard>

          </div>
        )}

        {tab === "absensi" && (
          <AttendanceCalendar attendances={emp.attendances} leaves={emp.leaves} trips={emp.businessTrips} shiftDays={shiftDays}
            side={<ScheduleCard userId={emp.id} schedules={schedules} patterns={patterns} canEdit={canEdit} />} />
        )}

        {tab === "absensi" && (
          emp.attendances.length === 0 ? <Empty text="Belum ada data absensi." /> : (
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50/60 hover:bg-gray-50/60">
                    <TableHead className="px-4"><T>Tanggal</T></TableHead>
                    <TableHead className="px-4"><T>Masuk</T></TableHead>
                    <TableHead className="px-4"><T>Pulang</T></TableHead>
                    <TableHead className="px-4"><T>Status</T></TableHead>
                    <TableHead className="hidden md:table-cell px-4"><T>Lokasi</T></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {emp.attendances.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="px-4 text-sm whitespace-nowrap">{fmtDate(a.date)}</TableCell>
                      <TableCell className="px-4 text-sm">{fmtTime(a.checkIn)}</TableCell>
                      <TableCell className="px-4 text-sm">{fmtTime(a.checkOut)}</TableCell>
                      <TableCell className="px-4">
                        <Pill cls={ATTENDANCE[a.status] ?? "bg-gray-100 text-gray-600 border-gray-200"}>{a.status}</Pill>
                      </TableCell>
                      <TableCell className="hidden md:table-cell px-4 text-xs text-gray-500 max-w-xs truncate">
                        {a.checkInAddr ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )
        )}

        {tab === "cuti" && (
          <div className="space-y-5">
          <LeaveBalanceCard rows={leaveBalances} />
          <p className="text-xs font-semibold uppercase tracking-wide text-white/70"><T>Riwayat Cuti</T></p>
          {emp.leaves.length === 0 ? <Empty text="Belum ada pengajuan cuti." /> : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50/60 hover:bg-gray-50/60">
                    <TableHead className="px-4"><T>Periode</T></TableHead>
                    <TableHead className="px-4"><T>Jenis</T></TableHead>
                    <TableHead className="px-4"><T>Hari</T></TableHead>
                    <TableHead className="hidden md:table-cell px-4"><T>Alasan</T></TableHead>
                    <TableHead className="px-4"><T>Status</T></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {emp.leaves.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="px-4 text-sm whitespace-nowrap">{fmtDate(l.startDate)} – {fmtDate(l.endDate)}</TableCell>
                      <TableCell className="px-4 text-sm">{l.policy ? <>{t(l.policy.name)} <span className="text-[11px] text-gray-400">{l.policy.code}</span></> : <T>{LEAVE_LABEL[l.type] ?? l.type}</T>}</TableCell>
                      <TableCell className="px-4 text-sm">{l.totalDays}</TableCell>
                      <TableCell className="hidden md:table-cell px-4 text-xs text-gray-500 max-w-xs truncate"><T>{l.reason}</T></TableCell>
                      <TableCell className="px-4">
                        <Pill cls={APPROVAL[l.status]?.cls ?? ""}><T>{APPROVAL[l.status]?.label ?? l.status}</T></Pill>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          </div>
        )}

        {tab === "cuti" && (
          <div className="mt-5 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/70"><T>Riwayat Dinas Luar</T></p>
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
          </div>
        )}

        {tab === "payslip" && canSeePay && (
          emp.payslips.length === 0 ? <Empty text="Belum ada slip gaji." /> : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50/60 hover:bg-gray-50/60">
                    <TableHead className="px-4"><T>Periode</T></TableHead>
                    <TableHead className="px-4 text-right"><T>Gaji Bersih</T></TableHead>
                    <TableHead className="hidden sm:table-cell px-4"><T>Dibayar</T></TableHead>
                    <TableHead className="hidden md:table-cell px-4"><T>Via</T></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {emp.payslips.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="px-4 text-sm">{p.periodLabel}</TableCell>
                      <TableCell className="px-4 text-sm text-right tabular-nums">{formatRupiah(p.netPay)}</TableCell>
                      <TableCell className="hidden sm:table-cell px-4 text-sm">{fmtDate(p.paidAt)}</TableCell>
                      <TableCell className="hidden md:table-cell px-4 text-xs text-gray-500">{p.paidVia ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )
        )}

        {tab === "akses" && isSuper && <AccessPanel employee={emp} />}
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
                    onChange={(value) => setForm((f) => ({ ...f, [field.key]: value }))}
                  />
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
