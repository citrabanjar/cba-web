"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Loader2, Mail, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { formatRupiah } from "@/lib/utils";
import { toggleEmployeeActive, updateEmployee, type EmployeeInput } from "../actions";

type Payslip = {
  id: string; periodLabel: string; basicSalary: number; overtimePay: number;
  mealAllowance: number; travelAllowance: number; otherBenefits: number;
  pph21: number; bpjsKesehatan: number; bpjsKetenagakerjaan: number;
  otherDeductions: number; netPay: number; paidAt: Date | null; paidVia: string | null;
};

type Employee = {
  id: string; employeeId: string; name: string; email: string | null;
  phone: string | null; image: string | null; role: string;
  employmentStatus: string; position: string | null; joinDate: Date | null;
  bankName: string | null; bankAccount: string | null; bankHolder: string | null;
  isActive: boolean;
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
  payslips: Payslip[];
};

type Section = "detail" | "unit" | "kontrak" | "pribadi";

const TABS = [
  { key: "pekerjaan", label: "Pekerjaan & Gaji" },
  { key: "pribadi", label: "Info Pribadi" },
  { key: "absensi", label: "Absensi" },
  { key: "cuti", label: "Cuti" },
  { key: "dinas", label: "Dinas Luar" },
  { key: "payslip", label: "Slip Gaji" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const ROLES = ["KARYAWAN", "HRD", "MANAGER", "ADMIN"];
const STATUSES = ["KONTRAK", "TETAP", "PROBATION"];

const STATUS_LABEL: Record<string, string> = {
  TETAP: "Tetap", KONTRAK: "Kontrak", PROBATION: "Probation",
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

function Pill({ cls, children }: { cls: string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
      {children}
    </span>
  );
}

function SectionCard({
  title, onEdit, children,
}: {
  title: string; onEdit?: () => void; children: React.ReactNode;
}) {
  return (
    <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 py-3 bg-gray-50 border-b border-gray-200">
        <h3 className="font-semibold text-sm text-gray-800">{title}</h3>
        {onEdit && (
          <Button size="sm" onClick={onEdit} className="h-7 px-4 text-xs">Edit</Button>
        )}
      </div>
      <dl className="px-5 py-3">{children}</dl>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[220px_1fr] gap-0.5 sm:gap-4 py-2">
      <dt className="text-sm font-medium text-gray-700">{label}</dt>
      <dd className="text-sm text-gray-600 break-words">{children || "—"}</dd>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 py-12 text-center text-sm text-gray-400">
      {text}
    </div>
  );
}

function PayslipSummary({ slip }: { slip: Payslip }) {
  const income: [string, number][] = [
    ["Gaji Pokok", slip.basicSalary],
    ["Lembur", slip.overtimePay],
    ["Uang Makan", slip.mealAllowance],
    ["Uang Dinas", slip.travelAllowance],
    ["Tunjangan Lain", slip.otherBenefits],
  ];
  const deductions: [string, number][] = [
    ["PPh 21", slip.pph21],
    ["BPJS Kesehatan", slip.bpjsKesehatan],
    ["BPJS Ketenagakerjaan", slip.bpjsKetenagakerjaan],
    ["Potongan Lain", slip.otherDeductions],
  ];
  return (
    <div className="grid sm:grid-cols-2 gap-x-8 gap-y-4 py-2">
      {[{ title: "Pendapatan", rows: income }, { title: "Potongan", rows: deductions }].map(col => (
        <div key={col.title}>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">{col.title}</p>
          {col.rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4 py-1 text-sm">
              <span className="text-gray-600">{label}</span>
              <span className="text-gray-800 tabular-nums">{formatRupiah(value)}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export default function KaryawanDetailClient({
  employee: emp, tenure,
}: {
  employee: Employee; tenure: string | null;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>("pekerjaan");
  const [editing, setEditing] = useState<Section | null>(null);
  const [form, setForm] = useState<Partial<EmployeeInput>>({});
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const initials = emp.name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();
  const latestSlip = emp.payslips[0];
  const set = (key: keyof EmployeeInput, value: string) =>
    setForm(f => ({ ...f, [key]: value }));

  function openEdit(section: Section) {
    const values: Record<Section, Partial<EmployeeInput>> = {
      detail: { name: emp.name, email: emp.email ?? "", role: emp.role },
      unit: { departmentName: emp.department?.name ?? "", position: emp.position ?? "" },
      kontrak: {
        employmentStatus: emp.employmentStatus,
        joinDate: emp.joinDate ? new Date(emp.joinDate).toISOString().split("T")[0] : "",
        bankName: emp.bankName ?? "",
        bankAccount: emp.bankAccount ?? "",
        bankHolder: emp.bankHolder ?? "",
      },
      pribadi: { phone: emp.phone ?? "" },
    };
    setForm(values[section]);
    setError(null);
    setEditing(section);
  }

  function handleSave() {
    if (editing === "detail" && !form.name?.trim()) {
      setError("Nama wajib diisi.");
      return;
    }
    startTransition(async () => {
      try {
        await updateEmployee(emp.id, form);
        setEditing(null);
        router.refresh();
      } catch {
        setError("Gagal menyimpan. Periksa apakah email sudah dipakai karyawan lain.");
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
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-sm font-medium text-gray-600">
          <Link href="/portal/admin/karyawan" className="hover:text-[#c42828]">Data Karyawan</Link>
          <ChevronRight size={15} className="text-gray-400" />
          <span className="text-gray-800 truncate">{emp.name}</span>
        </nav>

        {/* Profile header */}
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-5">
            {emp.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={emp.image} alt={emp.name} className="w-20 h-20 rounded-full object-cover shrink-0" />
            ) : (
              <div className="w-20 h-20 rounded-full bg-[#1e3a5f] flex items-center justify-center text-white text-2xl font-bold shrink-0">
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
                  <a href={`mailto:${emp.email}`} aria-label="Email" className="p-1 rounded-full bg-red-50 text-[#c42828] hover:bg-red-100">
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
                  {emp.isActive ? "Aktif" : "Nonaktif"}
                </Pill>
                <Pill cls="bg-gray-100 text-gray-700 border-gray-200">
                  {STATUS_LABEL[emp.employmentStatus] ?? emp.employmentStatus}
                </Pill>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={handleToggle} disabled={isPending} className="self-start sm:self-center">
              {emp.isActive ? "Nonaktifkan" : "Aktifkan"}
            </Button>
          </div>

          {/* Tabs */}
          <div role="tablist" className="flex gap-6 px-5 border-t border-gray-100 overflow-x-auto">
            {TABS.map(t => (
              <button
                key={t.key}
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => setTab(t.key)}
                className={`py-3 text-sm whitespace-nowrap border-b-2 transition-colors ${
                  tab === t.key
                    ? "border-[#c42828] text-gray-900 font-semibold"
                    : "border-transparent text-gray-500 hover:text-gray-800"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {tab === "pekerjaan" && (
          <div className="space-y-5">
            <SectionCard title="Detail Pekerjaan" onEdit={() => openEdit("detail")}>
              <Field label="Nama Lengkap">{emp.name}</Field>
              <Field label="NIK">{emp.employeeId}</Field>
              <Field label="Email">{emp.email}</Field>
              <Field label="Role Portal">{emp.role}</Field>
            </SectionCard>

            <SectionCard title="Unit Perusahaan" onEdit={() => openEdit("unit")}>
              <Field label="Departemen">{emp.department?.name}</Field>
              <Field label="Jabatan">{emp.position}</Field>
            </SectionCard>

            <SectionCard title="Kontrak & Rekening" onEdit={() => openEdit("kontrak")}>
              <Field label="Status Kerja">{STATUS_LABEL[emp.employmentStatus] ?? emp.employmentStatus}</Field>
              <Field label="Tanggal Masuk">{emp.joinDate ? fmtDate(emp.joinDate) : null}</Field>
              <Field label="Masa Kerja">{tenure}</Field>
              <Field label="Nama Bank">{emp.bankName}</Field>
              <Field label="No Rekening">{emp.bankAccount}</Field>
              <Field label="Nama Pemilik Rekening">{emp.bankHolder}</Field>
            </SectionCard>

            <SectionCard title={latestSlip ? `Gaji Terakhir (${latestSlip.periodLabel})` : "Gaji Terakhir"}>
              {latestSlip ? (
                <>
                  <PayslipSummary slip={latestSlip} />
                  <div className="flex justify-between gap-4 pt-3 mt-1 mb-1 border-t border-gray-100 text-sm font-semibold text-gray-900">
                    <span>Gaji Bersih</span>
                    <span className="tabular-nums">{formatRupiah(latestSlip.netPay)}</span>
                  </div>
                </>
              ) : (
                <p className="py-4 text-sm text-gray-400">Belum ada slip gaji.</p>
              )}
            </SectionCard>
          </div>
        )}

        {tab === "pribadi" && (
          <SectionCard title="Kontak" onEdit={() => openEdit("pribadi")}>
            <Field label="No HP">{emp.phone}</Field>
          </SectionCard>
        )}

        {tab === "absensi" && (
          emp.attendances.length === 0 ? <Empty text="Belum ada data absensi." /> : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50/60 hover:bg-gray-50/60">
                    <TableHead className="px-4">Tanggal</TableHead>
                    <TableHead className="px-4">Masuk</TableHead>
                    <TableHead className="px-4">Pulang</TableHead>
                    <TableHead className="px-4">Status</TableHead>
                    <TableHead className="hidden md:table-cell px-4">Lokasi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {emp.attendances.map(a => (
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
                    <TableHead className="px-4">Periode</TableHead>
                    <TableHead className="px-4">Jenis</TableHead>
                    <TableHead className="px-4">Hari</TableHead>
                    <TableHead className="hidden md:table-cell px-4">Alasan</TableHead>
                    <TableHead className="px-4">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {emp.leaves.map(l => (
                    <TableRow key={l.id}>
                      <TableCell className="px-4 text-sm whitespace-nowrap">{fmtDate(l.startDate)} – {fmtDate(l.endDate)}</TableCell>
                      <TableCell className="px-4 text-sm">{LEAVE_LABEL[l.type] ?? l.type}</TableCell>
                      <TableCell className="px-4 text-sm">{l.totalDays}</TableCell>
                      <TableCell className="hidden md:table-cell px-4 text-xs text-gray-500 max-w-xs truncate">{l.reason}</TableCell>
                      <TableCell className="px-4">
                        <Pill cls={APPROVAL[l.status]?.cls ?? ""}>{APPROVAL[l.status]?.label ?? l.status}</Pill>
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
                    <TableHead className="px-4">Periode</TableHead>
                    <TableHead className="px-4">Tujuan</TableHead>
                    <TableHead className="px-4">Hari</TableHead>
                    <TableHead className="hidden md:table-cell px-4">Keperluan</TableHead>
                    <TableHead className="px-4">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {emp.businessTrips.map(t => (
                    <TableRow key={t.id}>
                      <TableCell className="px-4 text-sm whitespace-nowrap">{fmtDate(t.startDate)} – {fmtDate(t.endDate)}</TableCell>
                      <TableCell className="px-4 text-sm">{t.destination}</TableCell>
                      <TableCell className="px-4 text-sm">{t.totalDays}</TableCell>
                      <TableCell className="hidden md:table-cell px-4 text-xs text-gray-500 max-w-xs truncate">{t.purpose}</TableCell>
                      <TableCell className="px-4">
                        <Pill cls={APPROVAL[t.status]?.cls ?? ""}>{APPROVAL[t.status]?.label ?? t.status}</Pill>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )
        )}

        {tab === "payslip" && (
          emp.payslips.length === 0 ? <Empty text="Belum ada slip gaji." /> : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50/60 hover:bg-gray-50/60">
                    <TableHead className="px-4">Periode</TableHead>
                    <TableHead className="px-4 text-right">Gaji Bersih</TableHead>
                    <TableHead className="hidden sm:table-cell px-4">Dibayar</TableHead>
                    <TableHead className="hidden md:table-cell px-4">Via</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {emp.payslips.map(p => (
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
      </main>

      {/* Dialog edit per bagian */}
      <Dialog open={editing !== null} onOpenChange={(open: boolean) => { if (!open) setEditing(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing === "detail" && "Edit Detail Pekerjaan"}
              {editing === "unit" && "Edit Unit Perusahaan"}
              {editing === "kontrak" && "Edit Kontrak & Rekening"}
              {editing === "pribadi" && "Edit Kontak"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-1">
            {error && <div className="text-sm px-4 py-3 rounded-lg bg-red-50 text-red-700">{error}</div>}

            {editing === "detail" && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs">Nama Lengkap *</Label>
                  <Input value={form.name ?? ""} onChange={e => set("name", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Email</Label>
                  <Input type="email" value={form.email ?? ""} onChange={e => set("email", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Role Portal</Label>
                  <Select value={form.role ?? emp.role} onValueChange={(v: string | null) => { if (v) set("role", v); }}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {editing === "unit" && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs">Departemen</Label>
                  <Input value={form.departmentName ?? ""} onChange={e => set("departmentName", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Jabatan</Label>
                  <Input value={form.position ?? ""} onChange={e => set("position", e.target.value)} />
                </div>
              </>
            )}

            {editing === "kontrak" && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Status Kerja</Label>
                    <Select
                      value={form.employmentStatus ?? emp.employmentStatus}
                      onValueChange={(v: string | null) => { if (v) set("employmentStatus", v); }}
                    >
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Tanggal Masuk</Label>
                    <Input type="date" value={form.joinDate ?? ""} onChange={e => set("joinDate", e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Nama Bank</Label>
                    <Input value={form.bankName ?? ""} onChange={e => set("bankName", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">No Rekening</Label>
                    <Input value={form.bankAccount ?? ""} onChange={e => set("bankAccount", e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Nama Pemilik Rekening</Label>
                  <Input value={form.bankHolder ?? ""} onChange={e => set("bankHolder", e.target.value)} />
                </div>
              </>
            )}

            {editing === "pribadi" && (
              <div className="space-y-1.5">
                <Label className="text-xs">No HP</Label>
                <Input value={form.phone ?? ""} onChange={e => set("phone", e.target.value)} />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEditing(null)}>Batal</Button>
            <Button size="sm" onClick={handleSave} disabled={isPending} className="gap-2">
              {isPending && <Loader2 size={14} className="animate-spin" />}
              Simpan Perubahan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
