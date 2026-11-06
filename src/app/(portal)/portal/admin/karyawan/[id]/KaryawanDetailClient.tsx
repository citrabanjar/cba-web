"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Loader2, Mail, Phone, Plus, Trash2 } from "lucide-react";
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
import { formatRupiah } from "@/lib/utils";
import { MENUS } from "@/lib/roles";
import {
  addSalaryAdjustment, setEmployeeAccess, toggleEmployeeActive, updateEmployee,
} from "../actions";
import { T, useT } from "@/components/i18n";

type Salary = {
  id: string; effectiveDate: Date; basicSalary: number; bpjsTkBase: number | null;
  bpjsKesBase: number | null; note: string | null; createdBy: string | null;
  components: { id: string; type: string; name: string; amount: number }[];
};

type Employee = {
  id: string; employeeNo: number | null; employeeId: string; name: string;
  email: string | null; phone: string | null; image: string | null; role: string;
  menuAccess: string[]; employmentStatus: string; position: string | null;
  branch: string | null; joinDate: Date | null; contractEndDate: Date | null;
  resignDate: Date | null; paymentSchedule: string | null;
  bankName: string | null; bankAccount: string | null; bankHolder: string | null;
  isActive: boolean; ktpNumber: string | null; address: string | null;
  birthPlace: string | null; birthDate: Date | null; gender: string | null;
  religion: string | null; maritalStatus: string | null; nationality: string | null;
  emergencyName: string | null; emergencyPhone: string | null;
  emergencyRelation: string | null; npwp: string | null; ptkpStatus: string | null;
  taxability: string | null; taxStatus: string | null; taxObjectCode: string | null;
  bpjsTkNumber: string | null; bpjsTkActive: boolean; bpjsKesNumber: string | null;
  bpjsKesActive: boolean; managerId: string | null;
  manager: { name: string; employeeId: string | null } | null;
  department: { id: string; name: string } | null;
  attendances: {
    id: string; date: Date; checkIn: Date | null; checkOut: Date | null;
    checkInAddr: string | null; status: string; note: string | null;
  }[];
  leaves: {
    id: string; type: string; startDate: Date; endDate: Date;
    totalDays: number; reason: string; status: string;
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
  type?: "date" | "email" | "select" | "suggest"; options?: Option[];
};
type Section = "detail" | "unit" | "kontrak" | "bank" | "pribadi" | "darurat" | "pajak" | "bpjs";
type Component = { type: "TUNJANGAN" | "POTONGAN"; name: string; amount: number };

const TAB_LIST = [
  { key: "pekerjaan", label: "Pekerjaan & Gaji" },
  { key: "pribadi", label: "Info Pribadi" },
  { key: "pajak", label: "Pajak & BPJS" },
  { key: "absensi", label: "Absensi" },
  { key: "cuti", label: "Cuti" },
  { key: "dinas", label: "Dinas Luar" },
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
  detail: "Detail Pekerjaan", unit: "Unit Perusahaan", kontrak: "Kontrak",
  bank: "Rekening Bank", pribadi: "Data Pribadi", darurat: "Kontak Darurat",
  pajak: "Pajak", bpjs: "BPJS",
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
  return new Date(d).toLocaleDateString("id-ID", {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  });
}
function fmtTime(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleTimeString("id-ID", {
    hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta",
  });
}
const toInputDate = (d: Date | null) => (d ? new Date(d).toISOString().split("T")[0] : "");

function Pill({ cls, children }: { cls: string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
      {children}
    </span>
  );
}

function SectionCard({
  title, onEdit, action, children,
}: {
  title: string; onEdit?: () => void; action?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 py-3 bg-gray-50 border-b border-gray-200">
        <h3 className="font-semibold text-sm text-gray-800"><T>{title}</T></h3>
        {action}
        {onEdit && <Button size="sm" onClick={onEdit} className="h-7 px-4 text-xs"><T>Edit</T></Button>}
      </div>
      <dl className="px-5 py-3">{children}</dl>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[220px_1fr] gap-0.5 sm:gap-4 py-2">
      <dt className="text-sm font-medium text-gray-700"><T>{label}</T></dt>
      <dd className="text-sm text-gray-600 break-words">{children || "—"}</dd>
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

function SalaryCard({ salary }: { salary: Salary }) {
  const benefits = salary.components.filter((c) => c.type === "TUNJANGAN");
  const deductions = salary.components.filter((c) => c.type === "POTONGAN");
  const total =
    salary.basicSalary +
    benefits.reduce((sum, c) => sum + c.amount, 0) -
    deductions.reduce((sum, c) => sum + c.amount, 0);
  const rows = [
    { label: "Gaji Pokok", value: salary.basicSalary },
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
        <span className="tabular-nums">{formatRupiah(total)}</span>
      </div>
    </div>
  );
}

function AccessPanel({ employee }: { employee: Employee }) {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(employee.role === "ADMIN");
  const [menus, setMenus] = useState<string[]>(employee.menuAccess);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      await setEmployeeAccess(employee.id, isAdmin ? "ADMIN" : "KARYAWAN", menus);
      setMessage("Akses tersimpan dan langsung berlaku.");
      router.refresh();
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
  employee, current, open, onClose,
}: {
  employee: Employee; current?: Salary; open: boolean; onClose: () => void;
}) {
  const router = useRouter();
  const [effectiveDate, setEffectiveDate] = useState("");
  const [basicSalary, setBasicSalary] = useState(String(current?.basicSalary ?? ""));
  const [note, setNote] = useState("");
  const [components, setComponents] = useState<Component[]>(
    (current?.components ?? []).map((c) => ({
      type: c.type as Component["type"], name: c.name, amount: c.amount,
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
          basicSalary: Number(basicSalary),
          bpjsTkBase: current?.bpjsTkBase ?? undefined,
          bpjsKesBase: current?.bpjsKesBase ?? undefined,
          note,
          components: components.filter((c) => c.name.trim() && c.amount > 0),
        });
        onClose();
        router.refresh();
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
            <div className="space-y-1.5">
              <Label className="text-xs"><T>Gaji Pokok *</T></Label>
              <Input type="number" value={basicSalary} onChange={(e) => setBasicSalary(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs"><T>Tunjangan dan Potongan</T></Label>
            {components.map((c, i) => (
              <div key={i} className="grid grid-cols-[100px_1fr_110px_auto] gap-2 items-center">
                <select value={c.type} aria-label="Jenis"
                  onChange={(e) => patch(i, { type: e.target.value as Component["type"] })}
                  className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm">
                  <option value="TUNJANGAN"><T>Tunjangan</T></option>
                  <option value="POTONGAN"><T>Potongan</T></option>
                </select>
                <Input value={c.name} placeholder="Nama" onChange={(e) => patch(i, { name: e.target.value })} />
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
              onClick={() => setComponents((prev) => [...prev, { type: "TUNJANGAN", name: "", amount: 0 }])}>
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
  employee: emp, tenure, managers, canSeePay, isSuper, canEdit,
}: {
  employee: Employee;
  tenure: string | null;
  managers: { id: string; name: string; employeeId: string | null }[];
  canSeePay: boolean;
  isSuper: boolean;
  canEdit: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const [tab, setTab] = useState("pekerjaan");
  const [editing, setEditing] = useState<Section | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [salaryOpen, setSalaryOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const tabs = TAB_LIST.filter(
    (t) => (t.key !== "payslip" || canSeePay) && (t.key !== "akses" || isSuper),
  );

  const fields = useMemo<Record<Section, FormField[]>>(() => ({
    detail: [
      { key: "employeeId", label: "ID Karyawan *" },
      { key: "name", label: "Nama Lengkap *" },
      { key: "email", label: "Email", type: "email" },
      {
        key: "managerEmployeeId", label: "Atasan Langsung (ID Karyawan)", type: "suggest",
        hint: "Isi ID Karyawan atasan langsung. Kosongkan kalau tidak punya atasan.",
        options: managers.flatMap((m) => (m.employeeId ? [{ value: m.employeeId, label: m.name }] : [])),
      },
    ],
    unit: [
      { key: "branch", label: "Cabang" },
      { key: "departmentName", label: "Departemen" },
      { key: "position", label: "Jabatan" },
    ],
    kontrak: [
      {
        key: "employmentStatus", label: "Status Kerja", type: "select",
        options: Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label })),
      },
      { key: "joinDate", label: "Tanggal Masuk", type: "date" },
      { key: "contractEndDate", label: "Tanggal Akhir Kontrak", type: "date" },
      { key: "resignDate", label: "Tanggal Resign", type: "date" },
      { key: "paymentSchedule", label: "Jadwal Bayar" },
    ],
    bank: [
      { key: "bankName", label: "Nama Bank" },
      { key: "bankAccount", label: "No Rekening" },
      { key: "bankHolder", label: "Nama Pemilik Rekening" },
    ],
    pribadi: [
      { key: "phone", label: "No HP" },
      { key: "ktpNumber", label: "No KTP" },
      { key: "address", label: "Alamat KTP" },
      { key: "birthPlace", label: "Tempat Lahir" },
      { key: "birthDate", label: "Tanggal Lahir", type: "date" },
      { key: "gender", label: "Jenis Kelamin" },
      { key: "religion", label: "Agama" },
      { key: "maritalStatus", label: "Status Nikah" },
      { key: "nationality", label: "Kewarganegaraan" },
    ],
    darurat: [
      { key: "emergencyName", label: "Nama" },
      { key: "emergencyPhone", label: "Nomor" },
      { key: "emergencyRelation", label: "Hubungan" },
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
  }), [managers]);

  const initials = emp.name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const today = new Date().toISOString().split("T")[0];
  const currentSalary = emp.salaries.find((s) => toInputDate(s.effectiveDate) <= today) ?? emp.salaries[0];
  const edit = (section: Section) => (canEdit ? () => openEdit(section) : undefined);

  function openEdit(section: Section) {
    const record = emp as unknown as Record<string, unknown>;
    const values: Record<string, string> = {};
    for (const field of fields[section]) {
      if (field.key === "departmentName") values[field.key] = emp.department?.name ?? "";
      else if (field.key === "managerEmployeeId") values[field.key] = emp.manager?.employeeId ?? "";
      else if (field.type === "date") values[field.key] = toInputDate(record[field.key] as Date | null);
      else values[field.key] = String(record[field.key] ?? "");
    }
    setForm(values);
    setError(null);
    setEditing(section);
  }

  function handleSave() {
    startTransition(async () => {
      try {
        await updateEmployee(emp.id, form);
        setEditing(null);
        router.refresh();
      } catch {
        setError("Gagal menyimpan. ID Karyawan, email, atau No KTP mungkin sudah dipakai, atau ID atasan tidak ditemukan atau merupakan anak buahnya sendiri.");
      }
    });
  }

  function handleToggle() {
    startTransition(async () => {
      await toggleEmployeeActive(emp.id);
      router.refresh();
    });
  }

  return (
    <div className="bg-gray-50 min-h-full">
      <main className="px-4 sm:px-6 py-5 max-w-6xl space-y-5">
        <nav className="flex items-center gap-1.5 text-sm font-medium text-gray-600">
          <Link href="/portal/admin/karyawan" className="hover:text-brand"><T>Data Karyawan</T></Link>
          <ChevronRight size={15} className="text-gray-400" />
          <span className="text-gray-800 truncate">{emp.name}</span>
        </nav>

        <div className="bg-white rounded-xl border border-gray-200">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-5">
            {emp.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={emp.image} alt={emp.name} className="w-20 h-20 rounded-full object-cover shrink-0" />
            ) : (
              <div className="w-20 h-20 rounded-full bg-ink flex items-center justify-center text-white text-2xl font-bold shrink-0">
                {initials}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-bold text-gray-900">{emp.name}</h2>
                {emp.phone && (
                  <a href={`tel:${emp.phone}`} aria-label="Telepon" className="p-1 rounded-full bg-green-50 text-green-700 hover:bg-green-100">
                    <Phone size={14} />
                  </a>
                )}
                {emp.email && (
                  <a href={`mailto:${emp.email}`} aria-label="Email" className="p-1 rounded-full bg-red-50 text-brand hover:bg-red-100">
                    <Mail size={14} />
                  </a>
                )}
              </div>
              <p className="text-sm text-gray-500 mt-0.5">
                {[emp.department?.name, emp.position].filter(Boolean).join(" · ") || "—"}
              </p>
              <div className="flex gap-2 mt-2">
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
            {canEdit && (
              <Button variant="outline" size="sm" onClick={handleToggle} disabled={isPending} className="self-start sm:self-center">
                {emp.isActive ? <T>{"Nonaktifkan"}</T> : <T>{"Aktifkan"}</T>}
              </Button>
            )}
          </div>

          <div role="tablist" className="flex gap-6 px-5 border-t border-gray-100 overflow-x-auto">
            {tabs.map((t) => (
              <button
                key={t.key}
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => setTab(t.key)}
                className={`py-3 text-sm whitespace-nowrap border-b-2 transition-colors ${
                  tab === t.key
                    ? "border-brand text-gray-900 font-semibold"
                    : "border-transparent text-gray-500 hover:text-gray-800"
                }`}
              >
                <T>{t.label}</T>
              </button>
            ))}
          </div>
        </div>

        {tab === "pekerjaan" && (
          <div className="space-y-5">
            <SectionCard title="Detail Pekerjaan" onEdit={edit("detail")}>
              <Field label="No. Urut">{emp.employeeNo}</Field>
              <Field label="ID Karyawan">{emp.employeeId}</Field>
              <Field label="Nama Lengkap">{emp.name}</Field>
              <Field label="Email">{emp.email}</Field>
              <Field label="Atasan Langsung">
                {emp.manager ? `${emp.manager.name} (${emp.manager.employeeId ?? "-"})` : null}
              </Field>
            </SectionCard>

            <SectionCard title="Unit Perusahaan" onEdit={edit("unit")}>
              <Field label="Cabang">{emp.branch}</Field>
              <Field label="Departemen">{emp.department?.name}</Field>
              <Field label="Jabatan">{emp.position}</Field>
            </SectionCard>

            <SectionCard title="Kontrak" onEdit={edit("kontrak")}>
              <Field label="Status Kerja"><T>{STATUS_LABEL[emp.employmentStatus] ?? emp.employmentStatus}</T></Field>
              <Field label="Tanggal Masuk">{emp.joinDate ? fmtDate(emp.joinDate) : null}</Field>
              <Field label="Masa Kerja">{tenure}</Field>
              <Field label="Tanggal Akhir Kontrak">{emp.contractEndDate ? fmtDate(emp.contractEndDate) : null}</Field>
              <Field label="Tanggal Resign">{emp.resignDate ? fmtDate(emp.resignDate) : null}</Field>
              <Field label="Jadwal Bayar">{emp.paymentSchedule}</Field>
            </SectionCard>

            <SectionCard title="Rekening Bank" onEdit={edit("bank")}>
              <Field label="Nama Bank">{emp.bankName}</Field>
              <Field label="No Rekening">{emp.bankAccount}</Field>
              <Field label="Nama Pemilik Rekening">{emp.bankHolder}</Field>
            </SectionCard>

            {canSeePay && (
              <>
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

                {emp.salaries.length > 0 && (
                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <h3 className="font-semibold text-sm text-gray-800 px-5 py-3 bg-gray-50 border-b border-gray-200">
                      <T>Riwayat Gaji</T>
                    </h3>
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="px-4"><T>Berlaku</T></TableHead>
                          <TableHead className="px-4 text-right"><T>Gaji Pokok</T></TableHead>
                          <TableHead className="px-4"><T>Catatan</T></TableHead>
                          <TableHead className="hidden sm:table-cell px-4"><T>Oleh</T></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {emp.salaries.map((s) => (
                          <TableRow key={s.id}>
                            <TableCell className="px-4 text-sm whitespace-nowrap">{fmtDate(s.effectiveDate)}</TableCell>
                            <TableCell className="px-4 text-sm text-right tabular-nums">{formatRupiah(s.basicSalary)}</TableCell>
                            <TableCell className="px-4 text-xs text-gray-500">{s.note ?? "—"}</TableCell>
                            <TableCell className="hidden sm:table-cell px-4 text-xs text-gray-500">{s.createdBy ?? "—"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {tab === "pribadi" && (
          <div className="space-y-5">
            <SectionCard title="Data Pribadi" onEdit={edit("pribadi")}>
              <Field label="No HP">{emp.phone}</Field>
              <Field label="No KTP">{emp.ktpNumber}</Field>
              <Field label="Alamat KTP">{emp.address}</Field>
              <Field label="Tempat Lahir">{emp.birthPlace}</Field>
              <Field label="Tanggal Lahir">{emp.birthDate ? fmtDate(emp.birthDate) : null}</Field>
              <Field label="Jenis Kelamin">{emp.gender}</Field>
              <Field label="Agama">{emp.religion}</Field>
              <Field label="Status Nikah">{emp.maritalStatus}</Field>
              <Field label="Kewarganegaraan">{emp.nationality}</Field>
            </SectionCard>
            <SectionCard title="Kontak Darurat" onEdit={edit("darurat")}>
              <Field label="Nama">{emp.emergencyName}</Field>
              <Field label="Nomor">{emp.emergencyPhone}</Field>
              <Field label="Hubungan">{emp.emergencyRelation}</Field>
            </SectionCard>
          </div>
        )}

        {tab === "pajak" && (
          <div className="space-y-5">
            <SectionCard title="Pajak" onEdit={edit("pajak")}>
              <Field label="NPWP">{emp.npwp}</Field>
              <Field label="Status PTKP">{emp.ptkpStatus}</Field>
              <Field label="Taxability">{emp.taxability}</Field>
              <Field label="Status Pajak">{emp.taxStatus}</Field>
              <Field label="Kode Objek Pajak">{emp.taxObjectCode}</Field>
            </SectionCard>
            <SectionCard title="BPJS" onEdit={edit("bpjs")}>
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
          </div>
        )}

        {tab === "absensi" && (
          emp.attendances.length === 0 ? <Empty text="Belum ada data absensi." /> : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
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
          emp.leaves.length === 0 ? <Empty text="Belum ada pengajuan cuti." /> : (
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
                      <TableCell className="px-4 text-sm"><T>{LEAVE_LABEL[l.type] ?? l.type}</T></TableCell>
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
          )
        )}

        {tab === "dinas" && (
          emp.businessTrips.length === 0 ? <Empty text="Belum ada pengajuan dinas luar." /> : (
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
          )
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

      {canSeePay && salaryOpen && (
        <SalaryDialog employee={emp} current={currentSalary} open={salaryOpen} onClose={() => setSalaryOpen(false)} />
      )}

      <Dialog open={editing !== null} onOpenChange={(open: boolean) => { if (!open) setEditing(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? `${t("Edit")} ${t(SECTION_TITLE[editing])}` : ""}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-1">
            {error && <div className="text-sm px-4 py-3 rounded-lg bg-red-50 text-red-700">{error}</div>}
            {editing && fields[editing].map((field) => (
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
