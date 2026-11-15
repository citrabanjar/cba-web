"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Search, Loader2, Users, UserCheck, BadgeCheck, Clock3, ImageUp,
} from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
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
  updateEmployee, reactivateEmployee, type EmployeeInput,
} from "./actions";
import type { MasterOptions } from "@/lib/master-data";
import { BANK_OPTIONS } from "@/lib/personal-info";
import EmployeeCombobox from "@/components/portal/EmployeeCombobox";
import ActionMenu, { QUICK_ACTIONS } from "@/components/portal/ActionMenu";
import { T, useT } from "@/components/i18n";
import { useCanEdit } from "@/components/portal/edit-access";
import PhotoUpload from "./PhotoUpload";

type Dept = { id: string; name: string };
type Employee = {
  id: string; employeeNo: number | null; employeeId: string; name: string; email: string | null;
  phone: string | null; role: string; employmentStatus: string;
  branch: string | null; position: string | null; isActive: boolean; joinDate: Date | null;
  bankName: string | null; bankAccount: string | null; bankHolder: string | null;
  department: Dept | null;
};

const STATUSES = ["KONTRAK", "TETAP"];

const STATUS_BADGE: Record<string, string> = {
  TETAP: "bg-emerald-100 text-emerald-700 border-emerald-200",
  KONTRAK: "bg-amber-100 text-amber-700 border-amber-200",
  PROBATION: "bg-orange-100 text-orange-700 border-orange-200",
};

const EMPTY: Partial<EmployeeInput> = {
  employeeId: "", name: "", email: "", phone: "",
  branch: "", departmentName: "", position: "", employmentStatus: "KONTRAK",
  joinDate: "", password: "",
  bankName: "", bankAccount: "", bankHolder: "",
};

function StatusBadge({ value, map }: { value: string; map: Record<string, string> }) {
  const cls = map[value] ?? "bg-gray-100 text-gray-600 border-gray-200";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
      {value}
    </span>
  );
}

function MasterSelect({
  label, value, options, onChange,
}: {
  label: string; value: string; options: string[]; onChange: (value: string) => void;
}) {
  const choices = value && !options.includes(value) ? [value, ...options] : options;
  return (
    <div className="space-y-1.5">
      <Label className="text-xs"><T>{label}</T></Label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm"
      >
        <option value="">—</option>
        {choices.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

export default function KaryawanClient({
  employees: initial, master,
}: {
  employees: Employee[]; master: MasterOptions;
}) {
  const t = useT();
  const router = useRouter();
  const canEdit = useCanEdit("karyawan"); // hak lihat saja: tombol ubah data disembunyikan
  const [employees, setEmployees] = useState(initial);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<"none" | "add" | "edit" | "upload" | "photo">("none");
  const [editTarget, setEditTarget] = useState<Employee | null>(null);
  const [form, setForm] = useState<Partial<EmployeeInput>>({ ...EMPTY });
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const [view, setView] = useState<"all" | "active" | "inactive">("active");
  const stats = {
    total: employees.length,
    active: employees.filter((e) => e.isActive).length,
    tetap: employees.filter((e) => e.isActive && e.employmentStatus === "TETAP").length,
    kontrak: employees.filter((e) => e.isActive && e.employmentStatus === "KONTRAK").length,
  };

  const filtered = employees.filter(e =>
    (view === "all" || (view === "active") === e.isActive)
  ).filter(e =>
    !search ||
    e.name.toLowerCase().includes(search.toLowerCase()) ||
    e.employeeId.toLowerCase().includes(search.toLowerCase()) ||
    (e.email ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (e.position ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (e.department?.name ?? "").toLowerCase().includes(search.toLowerCase())
  );

  function openEdit(emp: Employee) {
    setEditTarget(emp);
    setForm({
      employeeId: emp.employeeId, name: emp.name, email: emp.email ?? "",
      phone: emp.phone ?? "", branch: emp.branch ?? "", departmentName: emp.department?.name ?? "",
      position: emp.position ?? "", employmentStatus: emp.employmentStatus,
      joinDate: emp.joinDate ? new Date(emp.joinDate).toISOString().split("T")[0] : "",
      password: "", bankName: emp.bankName ?? "",
      bankAccount: emp.bankAccount ?? "", bankHolder: emp.bankHolder ?? "",
    });
    setMsg(null);
    setModal("edit");
  }

  function handleSave() {
    if (!form.employeeId?.trim() || !form.name?.trim()) {
      setMsg({ type: "err", text: "ID Karyawan dan Nama wajib diisi." });
      return;
    }
    startTransition(async () => {
      try {
        if (editTarget) {
          await updateEmployee(editTarget.id, {
            ...form,
            password: form.password || undefined,
          });
          setEmployees(prev => prev.map(e => e.id === editTarget.id ? {
            ...e,
            employeeId: form.employeeId ?? e.employeeId,
            name: form.name ?? e.name,
            email: form.email || null, phone: form.phone || null, branch: form.branch || null,
            position: form.position || null, bankName: form.bankName || null,
            bankAccount: form.bankAccount || null, bankHolder: form.bankHolder || null,
            employmentStatus: form.employmentStatus ?? e.employmentStatus,
            joinDate: form.joinDate ? new Date(form.joinDate) : e.joinDate,
            department: form.departmentName ? { id: e.department?.id ?? "", name: form.departmentName } : null,
          } : e));
        }
        setModal("none");
      } catch {
        setMsg({ type: "err", text: "Gagal menyimpan. ID Karyawan atau email mungkin sudah dipakai." });
      }
    });
  }

  function handleReactivate(emp: Employee) {
    if (!window.confirm(t("Aktifkan kembali karyawan ini?"))) return;
    startTransition(async () => {
      await reactivateEmployee(emp.id);
      setEmployees(prev => prev.map(e => e.id === emp.id ? { ...e, isActive: true } : e));
    });
  }

  const isFormOpen = modal === "add" || modal === "edit";

  return (
    <div className="bg-gray-50 min-h-full">
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="font-bold text-gray-800"><T>Data Karyawan</T></h2>
          <p className="text-xs text-gray-400 mt-0.5">{employees.length} <T>karyawan terdaftar</T></p>
        </div>
        {/* Karyawan baru lewat Pra-Karyawan / Pengaturan -> Import Data. Upload foto di sini. */}
        {canEdit && (
          <Button variant="outline" size="sm" onClick={() => setModal("photo")} className="h-9 gap-1.5 self-start rounded-full px-4 lg:self-auto">
            <ImageUp size={15} /> <T>Upload Foto</T>
          </Button>
        )}
      </div>

      <main className="px-4 sm:px-6 py-5 max-w-6xl space-y-5">
        {/* Ringkasan, gaya kartu angka Code XR FinSet */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: "Total Karyawan", value: stats.total, icon: Users, tone: "from-brand to-rose-400" },
            { label: "Aktif", value: stats.active, icon: UserCheck, tone: "from-emerald-500 to-teal-400" },
            { label: "Tetap", value: stats.tetap, icon: BadgeCheck, tone: "from-sky-500 to-indigo-400" },
            { label: "Kontrak", value: stats.kontrak, icon: Clock3, tone: "from-amber-500 to-orange-400" },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-2xl border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-gray-500"><T>{s.label}</T></p>
                <span className={`flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br text-white ${s.tone}`}>
                  <s.icon size={15} />
                </span>
              </div>
              <p className="mt-2 text-2xl font-bold tracking-tight text-gray-900">{s.value}</p>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          {/* Judul tabel, filter status, cari, dan tombol aksi */}
          <div className="flex flex-col gap-3 border-b border-gray-100 p-4 lg:flex-row lg:items-center">
            <div className="flex items-center gap-1 rounded-full bg-gray-100 p-1">
              {([
                { key: "active", label: "Aktif" },
                { key: "inactive", label: "Nonaktif" },
                { key: "all", label: "Semua" },
              ] as const).map((v) => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => setView(v.key)}
                  className={`h-8 rounded-full px-4 text-xs font-semibold transition-colors ${
                    view === v.key ? "bg-ink text-white shadow-sm" : "text-gray-500 hover:text-gray-900"
                  }`}
                >
                  <T>{v.label}</T>
                </button>
              ))}
            </div>
            <div className="relative w-full lg:ml-auto lg:w-72">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={t("Cari ID, nama, jabatan...")}
                className="h-9 rounded-full bg-gray-50 pl-10"
              />
            </div>
          </div>

          {/* Daftar bisa digulir atas-bawah sendiri; judul kolom tetap terlihat */}
          <Table containerClassName="max-h-[calc(100vh-240px)] min-h-64 overflow-y-auto">
            <TableHeader className="sticky top-0 z-10 bg-white shadow-[0_1px_0_0_#f3f4f6]">
              <TableRow className="hover:bg-transparent [&>th]:text-[11px] [&>th]:font-semibold [&>th]:uppercase [&>th]:tracking-wider [&>th]:text-gray-400">
                <TableHead className="w-[70px] px-5"><T>No.</T></TableHead>
                <TableHead className="px-4"><T>Nama</T></TableHead>
                <TableHead className="hidden md:table-cell px-4"><T>Departemen</T></TableHead>
                <TableHead className="hidden lg:table-cell px-4"><T>Status Kerja</T></TableHead>
                <TableHead className="hidden sm:table-cell px-4"><T>Status</T></TableHead>
                <TableHead className="text-right px-5"><T>Aksi</T></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={6} className="text-center py-12 text-gray-400 text-sm">
                    {search ? <T>{"Tidak ada karyawan yang cocok."}</T> : <T>{"Belum ada karyawan. Tambah atau import dari Excel."}</T>}
                  </TableCell>
                </TableRow>
              )}
              {filtered.map(emp => (
                <TableRow key={emp.id} className={`[&>td]:py-3 ${!emp.isActive ? "opacity-60" : ""}`}>
                  <TableCell className="px-5 text-xs text-gray-400 tabular-nums">{emp.employeeNo ?? "—"}</TableCell>
                  <TableCell className="px-4">
                    <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-ink to-brand-dark text-[11px] font-bold text-white">
                      {emp.name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      {/* Baris baru masih ber-id sementara sampai halaman dimuat ulang */}
                      {emp.id.startsWith("tmp-") ? (
                        <p className="font-medium text-sm text-gray-800">{emp.name}</p>
                      ) : (
                        <Link
                          href={`/portal/admin/karyawan/${emp.id}`}
                          className="font-medium text-sm text-gray-800 hover:text-brand hover:underline"
                        >
                          {emp.name}
                        </Link>
                      )}
                      <p className="font-mono text-xs text-gray-500">{emp.employeeId}</p>
                    </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell px-4 text-sm text-gray-600">
                    <div>
                      <p>{emp.department?.name ?? "—"}</p>
                      {emp.position && <p className="text-xs text-gray-400">{emp.position}</p>}
                    </div>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell px-4">
                    <StatusBadge value={emp.employmentStatus} map={STATUS_BADGE} />
                  </TableCell>
                  <TableCell className="hidden sm:table-cell px-4">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
                      emp.isActive
                        ? "bg-green-50 text-green-700 border-green-200"
                        : "bg-red-50 text-red-700 border-red-200"
                    }`}>
                      {emp.isActive ? <T>{"Aktif"}</T> : <T>{"Nonaktif"}</T>}
                    </span>
                  </TableCell>
                  <TableCell className="px-5 text-right whitespace-nowrap">
                    <ActionMenu items={[
                      ...(emp.id.startsWith("tmp-") ? [] : [
                        { label: "Detail", onClick: () => router.push(`/portal/admin/karyawan/${emp.id}`) },
                      ]),
                      ...(canEdit ? [{ label: "Edit", onClick: () => openEdit(emp) }] : []),
                      ...(emp.id.startsWith("tmp-") || !canEdit ? [] : QUICK_ACTIONS
                        .filter((item) => emp.isActive || item.key !== "resign")
                        .map((item) => ({
                          label: item.label,
                          onClick: () => router.push(`/portal/admin/karyawan/${emp.id}?aksi=${item.key}`),
                        }))),
                      ...(emp.isActive || !canEdit ? [] : [{
                        label: "Aktifkan Kembali",
                        onClick: () => handleReactivate(emp),
                        disabled: isPending,
                      }]),
                      ...(emp.id.startsWith("tmp-") ? [] : [{
                        label: "History Perubahan",
                        onClick: () => router.push(`/portal/admin/karyawan/${emp.id}?aksi=history`),
                        separated: true,
                      }]),
                    ]} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </main>

      {/* Add/Edit Dialog */}
      <Dialog open={isFormOpen} onOpenChange={(open: boolean) => { if (!open) setModal("none"); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{modal === "add" ? <T>{"Tambah Karyawan"}</T> : <T>{"Edit Karyawan"}</T>}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-1">
            {msg && (
              <div className={`text-sm px-4 py-3 rounded-lg ${msg.type === "err" ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>
                <T>{msg.text}</T>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs"><T>ID Karyawan *</T></Label>
                <Input value={form.employeeId ?? ""} onChange={e => setForm(f => ({ ...f, employeeId: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs"><T>Nama Lengkap *</T></Label>
                <Input value={form.name ?? ""} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs"><T>Email</T></Label>
                <Input type="email" value={form.email ?? ""} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs"><T>No HP</T></Label>
                <Input value={form.phone ?? ""} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <MasterSelect label="Departemen" value={form.departmentName ?? ""} options={master.departments}
                onChange={(value) => setForm(f => ({ ...f, departmentName: value }))} />
              <MasterSelect label="Jabatan" value={form.position ?? ""} options={master.positions}
                onChange={(value) => setForm(f => ({ ...f, position: value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <MasterSelect label="Cabang" value={form.branch ?? ""} options={master.branches}
                onChange={(value) => setForm(f => ({ ...f, branch: value }))} />
              <div className="space-y-1.5">
                <Label className="text-xs"><T>Status Kerja</T></Label>
                <Select
                  value={form.employmentStatus ?? "KONTRAK"}
                  onValueChange={(v: string | null) => setForm(f => ({ ...f, employmentStatus: v ?? f.employmentStatus }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs"><T>Tanggal Masuk</T></Label>
              <Input type="date" value={form.joinDate ?? ""} onChange={e => setForm(f => ({ ...f, joinDate: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">
                {modal === "add" ? <T>{"Password (opsional)"}</T> : <T>{"Password Baru (kosongkan jika tidak diganti)"}</T>}
              </Label>
              <Input type="password" value={form.password ?? ""} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
            </div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide pt-1"><T>Info Bank</T></p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs"><T>Nama Bank</T></Label>
                <EmployeeCombobox id="bankName" value={form.bankName ?? ""} options={BANK_OPTIONS}
                  onChange={(value) => setForm(f => ({ ...f, bankName: value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs"><T>No Rekening</T></Label>
                <Input value={form.bankAccount ?? ""} onChange={e => setForm(f => ({ ...f, bankAccount: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs"><T>Nama Pemilik Rekening</T></Label>
              <Input value={form.bankHolder ?? ""} onChange={e => setForm(f => ({ ...f, bankHolder: e.target.value }))} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setModal("none")}><T>Batal</T></Button>
            <Button size="sm" onClick={handleSave} disabled={isPending} className="gap-2">
              {isPending && <Loader2 size={14} className="animate-spin" />}
              {modal === "add" ? <T>{"Simpan Karyawan"}</T> : <T>{"Simpan Perubahan"}</T>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {modal === "photo" && (
        <PhotoUpload
          employees={employees.filter((e) => e.isActive && !e.id.startsWith("tmp-"))}
          onClose={(changed) => { setModal("none"); if (changed) router.refresh(); }}
        />
      )}
    </div>
  );
}
