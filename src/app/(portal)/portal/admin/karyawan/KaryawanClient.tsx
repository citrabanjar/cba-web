"use client";

import { useState, useTransition, useRef } from "react";
import { Search, Plus, Upload, Download, CheckCircle2, Loader2 } from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  createEmployee, updateEmployee, toggleEmployeeActive,
  bulkCreateEmployees, type EmployeeInput,
} from "./actions";

type Dept = { id: string; name: string };
type Employee = {
  id: string; employeeId: string; name: string; email: string | null;
  phone: string | null; role: string; employmentStatus: string;
  position: string | null; isActive: boolean; joinDate: Date | null;
  bankName: string | null; bankAccount: string | null; bankHolder: string | null;
  department: Dept | null;
};

const ROLES = ["KARYAWAN", "HRD", "MANAGER", "ADMIN"];
const STATUSES = ["KONTRAK", "TETAP", "PROBATION"];

const ROLE_BADGE: Record<string, string> = {
  KARYAWAN: "bg-gray-100 text-gray-600 border-gray-200",
  HRD: "bg-green-100 text-green-700 border-green-200",
  MANAGER: "bg-blue-100 text-blue-700 border-blue-200",
  ADMIN: "bg-red-100 text-[#c42828] border-red-200",
};
const STATUS_BADGE: Record<string, string> = {
  TETAP: "bg-emerald-100 text-emerald-700 border-emerald-200",
  KONTRAK: "bg-amber-100 text-amber-700 border-amber-200",
  PROBATION: "bg-orange-100 text-orange-700 border-orange-200",
};

const EMPTY: Partial<EmployeeInput> = {
  employeeId: "", name: "", email: "", phone: "",
  departmentName: "", position: "", employmentStatus: "KONTRAK",
  role: "KARYAWAN", joinDate: "", password: "",
  bankName: "", bankAccount: "", bankHolder: "",
};

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.trim().split("\n").map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map(line => {
    const cols: string[] = [];
    let cur = "", inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === "," && !inQ) { cols.push(cur); cur = ""; continue; }
      cur += ch;
    }
    cols.push(cur);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = (cols[i] ?? "").trim(); });
    return obj;
  });
}

const CSV_HEADERS = [
  "NIK", "Nama", "Email", "No HP", "Departemen", "Jabatan",
  "Status Kerja", "Role", "Tanggal Masuk", "Password",
  "No Rekening", "Nama Bank", "Nama Pemilik Rekening",
];
const CSV_EXAMPLE = [
  "CBA001", "Ahmad Subarjo", "ahmad@email.com", "081234567890",
  "Teknik", "Fabricator", "TETAP", "KARYAWAN", "2024-01-15", "CBA@2025",
  "1234567890", "BCA", "Ahmad Subarjo",
];

function downloadTemplate() {
  const csv = [CSV_HEADERS.join(","), CSV_EXAMPLE.join(",")].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "template_karyawan.csv"; a.click();
  URL.revokeObjectURL(url);
}

function csvRowToInput(row: Record<string, string>): EmployeeInput {
  return {
    employeeId: row["NIK"] ?? "",
    name: row["Nama"] ?? "",
    email: row["Email"] || undefined,
    phone: row["No HP"] || undefined,
    departmentName: row["Departemen"] || undefined,
    position: row["Jabatan"] || undefined,
    employmentStatus: row["Status Kerja"] || "KONTRAK",
    role: row["Role"] || "KARYAWAN",
    joinDate: row["Tanggal Masuk"] || undefined,
    password: row["Password"] || "CBA@2025",
    bankName: row["Nama Bank"] || undefined,
    bankAccount: row["No Rekening"] || undefined,
    bankHolder: row["Nama Pemilik Rekening"] || undefined,
  };
}

function StatusBadge({ value, map }: { value: string; map: Record<string, string> }) {
  const cls = map[value] ?? "bg-gray-100 text-gray-600 border-gray-200";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
      {value}
    </span>
  );
}

export default function KaryawanClient({ employees: initial }: { employees: Employee[]; depts: Dept[] }) {
  const [employees, setEmployees] = useState(initial);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<"none" | "add" | "edit" | "upload">("none");
  const [editTarget, setEditTarget] = useState<Employee | null>(null);
  const [form, setForm] = useState<Partial<EmployeeInput>>({ ...EMPTY });
  const [csvRows, setCsvRows] = useState<EmployeeInput[]>([]);
  const [importResult, setImportResult] = useState<{ ok: number; skip: number } | null>(null);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const filtered = employees.filter(e =>
    !search ||
    e.name.toLowerCase().includes(search.toLowerCase()) ||
    e.employeeId.toLowerCase().includes(search.toLowerCase()) ||
    (e.email ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (e.position ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (e.department?.name ?? "").toLowerCase().includes(search.toLowerCase())
  );

  function openAdd() {
    setForm({ ...EMPTY });
    setMsg(null);
    setModal("add");
  }

  function openEdit(emp: Employee) {
    setEditTarget(emp);
    setForm({
      employeeId: emp.employeeId, name: emp.name, email: emp.email ?? "",
      phone: emp.phone ?? "", departmentName: emp.department?.name ?? "",
      position: emp.position ?? "", employmentStatus: emp.employmentStatus,
      role: emp.role,
      joinDate: emp.joinDate ? new Date(emp.joinDate).toISOString().split("T")[0] : "",
      password: "", bankName: emp.bankName ?? "",
      bankAccount: emp.bankAccount ?? "", bankHolder: emp.bankHolder ?? "",
    });
    setMsg(null);
    setModal("edit");
  }

  function handleSave() {
    if (!form.employeeId?.trim() || !form.name?.trim()) {
      setMsg({ type: "err", text: "NIK dan Nama wajib diisi." });
      return;
    }
    if (modal === "add" && !form.password?.trim()) {
      setMsg({ type: "err", text: "Password wajib diisi." });
      return;
    }
    startTransition(async () => {
      try {
        if (modal === "add") {
          await createEmployee(form as EmployeeInput);
          setEmployees(prev => [...prev, {
            id: "tmp-" + Date.now(),
            employeeId: form.employeeId!, name: form.name!,
            email: form.email || null, phone: form.phone || null,
            role: form.role ?? "KARYAWAN", employmentStatus: form.employmentStatus ?? "KONTRAK",
            position: form.position || null, isActive: true, joinDate: null,
            bankName: form.bankName || null, bankAccount: form.bankAccount || null,
            bankHolder: form.bankHolder || null,
            department: form.departmentName ? { id: "", name: form.departmentName } : null,
          }]);
        } else if (editTarget) {
          await updateEmployee(editTarget.id, form);
          setEmployees(prev => prev.map(e => e.id === editTarget.id ? {
            ...e,
            name: form.name ?? e.name,
            email: form.email || null, phone: form.phone || null,
            position: form.position || null, bankName: form.bankName || null,
            bankAccount: form.bankAccount || null, bankHolder: form.bankHolder || null,
            role: form.role ?? e.role,
            employmentStatus: form.employmentStatus ?? e.employmentStatus,
            joinDate: form.joinDate ? new Date(form.joinDate) : e.joinDate,
            department: form.departmentName ? { id: e.department?.id ?? "", name: form.departmentName } : null,
          } : e));
        }
        setModal("none");
      } catch (e) {
        setMsg({ type: "err", text: "Gagal menyimpan: " + String(e) });
      }
    });
  }

  function handleToggle(emp: Employee) {
    startTransition(async () => {
      await toggleEmployeeActive(emp.id);
      setEmployees(prev => prev.map(e => e.id === emp.id ? { ...e, isActive: !e.isActive } : e));
    });
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const parsed = parseCsv(text);
      setCsvRows(parsed.map(csvRowToInput).filter(r => r.employeeId && r.name));
      setImportResult(null);
    };
    reader.readAsText(file);
  }

  function handleImport() {
    if (!csvRows.length) return;
    startTransition(async () => {
      const { results } = await bulkCreateEmployees(csvRows);
      const ok = results.filter(r => r.status === "ok").length;
      const skip = results.filter(r => r.status === "skip").length;
      setImportResult({ ok, skip });
      setCsvRows([]);
      if (fileRef.current) fileRef.current.value = "";
      window.location.reload();
    });
  }

  const isFormOpen = modal === "add" || modal === "edit";

  return (
    <div className="bg-gray-50 min-h-full">
      <div className="bg-white border-b border-gray-100 px-6 py-4">
        <h2 className="font-bold text-gray-800">Data Karyawan</h2>
        <p className="text-xs text-gray-400 mt-0.5">{employees.length} karyawan terdaftar</p>
      </div>

      <main className="px-6 py-5 max-w-6xl space-y-4">
        {/* Action bar */}
        <div className="flex gap-2 flex-wrap items-center">
          <Button onClick={openAdd} size="sm" className="gap-1.5">
            <Plus size={15} /> Tambah Karyawan
          </Button>
          <Button variant="outline" size="sm"
            onClick={() => { setModal("upload"); setCsvRows([]); setImportResult(null); }}
            className="gap-1.5">
            <Upload size={15} /> Upload CSV
          </Button>
          <Button variant="outline" size="sm" onClick={downloadTemplate} className="gap-1.5">
            <Download size={15} /> Template
          </Button>
          <div className="relative ml-auto w-full sm:w-72 mt-2 sm:mt-0">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Cari NIK, nama, jabatan..."
              className="pl-9"
            />
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50/60 hover:bg-gray-50/60">
                <TableHead className="w-[110px] px-4">NIK</TableHead>
                <TableHead className="px-4">Nama</TableHead>
                <TableHead className="hidden md:table-cell px-4">Departemen</TableHead>
                <TableHead className="hidden lg:table-cell px-4">Status Kerja</TableHead>
                <TableHead className="hidden lg:table-cell px-4">Role</TableHead>
                <TableHead className="hidden sm:table-cell px-4">Status</TableHead>
                <TableHead className="text-right px-4">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={7} className="text-center py-12 text-gray-400 text-sm">
                    {search ? "Tidak ada karyawan yang cocok." : "Belum ada karyawan. Tambah atau upload CSV."}
                  </TableCell>
                </TableRow>
              )}
              {filtered.map(emp => (
                <TableRow key={emp.id} className={!emp.isActive ? "opacity-50" : ""}>
                  <TableCell className="px-4 font-mono text-xs text-gray-500 whitespace-nowrap">
                    {emp.employeeId}
                  </TableCell>
                  <TableCell className="px-4">
                    <div>
                      <p className="font-medium text-sm text-gray-800">{emp.name}</p>
                      <p className="text-xs text-gray-400">{emp.email ?? "—"}</p>
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
                  <TableCell className="hidden lg:table-cell px-4">
                    <StatusBadge value={emp.role} map={ROLE_BADGE} />
                  </TableCell>
                  <TableCell className="hidden sm:table-cell px-4">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
                      emp.isActive
                        ? "bg-green-50 text-green-700 border-green-200"
                        : "bg-red-50 text-red-700 border-red-200"
                    }`}>
                      {emp.isActive ? "Aktif" : "Nonaktif"}
                    </span>
                  </TableCell>
                  <TableCell className="px-4 text-right whitespace-nowrap">
                    <div className="flex gap-1 justify-end">
                      <Button variant="ghost" size="sm"
                        onClick={() => openEdit(emp)}
                        className="h-7 px-2 text-xs text-[#c42828] hover:text-[#c42828] hover:bg-red-50">
                        Edit
                      </Button>
                      <Button variant="ghost" size="sm"
                        onClick={() => handleToggle(emp)} disabled={isPending}
                        className={`h-7 px-2 text-xs ${emp.isActive
                          ? "text-gray-500 hover:text-red-600 hover:bg-red-50"
                          : "text-gray-500 hover:text-green-600 hover:bg-green-50"}`}>
                        {emp.isActive ? "Nonaktifkan" : "Aktifkan"}
                      </Button>
                    </div>
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
            <DialogTitle>{modal === "add" ? "Tambah Karyawan" : "Edit Karyawan"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-1">
            {msg && (
              <div className={`text-sm px-4 py-3 rounded-lg ${msg.type === "err" ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>
                {msg.text}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">NIK *</Label>
                <Input value={form.employeeId ?? ""} onChange={e => setForm(f => ({ ...f, employeeId: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Nama Lengkap *</Label>
                <Input value={form.name ?? ""} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Email</Label>
                <Input type="email" value={form.email ?? ""} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">No HP</Label>
                <Input value={form.phone ?? ""} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Departemen</Label>
                <Input value={form.departmentName ?? ""} onChange={e => setForm(f => ({ ...f, departmentName: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Jabatan</Label>
                <Input value={form.position ?? ""} onChange={e => setForm(f => ({ ...f, position: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Status Kerja</Label>
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
              <div className="space-y-1.5">
                <Label className="text-xs">Role</Label>
                <Select
                  value={form.role ?? "KARYAWAN"}
                  onValueChange={(v: string | null) => setForm(f => ({ ...f, role: v ?? f.role }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Tanggal Masuk</Label>
              <Input type="date" value={form.joinDate ?? ""} onChange={e => setForm(f => ({ ...f, joinDate: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">
                {modal === "add" ? "Password *" : "Password Baru (kosongkan jika tidak diganti)"}
              </Label>
              <Input type="password" value={form.password ?? ""} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
            </div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide pt-1">Info Bank</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Nama Bank</Label>
                <Input value={form.bankName ?? ""} onChange={e => setForm(f => ({ ...f, bankName: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">No Rekening</Label>
                <Input value={form.bankAccount ?? ""} onChange={e => setForm(f => ({ ...f, bankAccount: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Nama Pemilik Rekening</Label>
              <Input value={form.bankHolder ?? ""} onChange={e => setForm(f => ({ ...f, bankHolder: e.target.value }))} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setModal("none")}>Batal</Button>
            <Button size="sm" onClick={handleSave} disabled={isPending} className="gap-2">
              {isPending && <Loader2 size={14} className="animate-spin" />}
              {modal === "add" ? "Simpan Karyawan" : "Simpan Perubahan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CSV Upload Dialog */}
      <Dialog open={modal === "upload"} onOpenChange={(open: boolean) => { if (!open) setModal("none"); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Upload CSV Karyawan</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div className="bg-blue-50 rounded-lg p-3 text-xs text-blue-700 space-y-1">
              <p className="font-semibold">Format kolom CSV:</p>
              <p className="text-blue-600">NIK, Nama, Email, No HP, Departemen, Jabatan, Status Kerja, Role, Tanggal Masuk, Password, No Rekening, Nama Bank, Nama Pemilik Rekening</p>
              <p className="text-blue-500">• Status Kerja: TETAP / KONTRAK / PROBATION</p>
              <p className="text-blue-500">• Role: KARYAWAN / HRD / MANAGER / ADMIN</p>
              <p className="text-blue-500">• Tanggal: YYYY-MM-DD (mis. 2024-01-15)</p>
              <p className="text-blue-500">• NIK yang sudah ada akan dilewati</p>
            </div>

            <Button variant="outline" onClick={downloadTemplate} className="w-full gap-2">
              <Download size={15} /> Download Template CSV
            </Button>

            <div className="space-y-1.5">
              <Label className="text-xs">Pilih File CSV</Label>
              <input ref={fileRef} type="file" accept=".csv,text/csv"
                onChange={handleFileChange}
                className="w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-[#c42828] file:text-white file:text-xs file:font-medium hover:file:bg-red-700 cursor-pointer" />
            </div>

            {csvRows.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2">{csvRows.length} data siap diimport:</p>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {csvRows.slice(0, 10).map((r, i) => (
                    <div key={i} className="flex items-center gap-2 bg-gray-50 rounded px-3 py-1.5 text-xs">
                      <span className="font-mono text-gray-500 w-16 shrink-0">{r.employeeId}</span>
                      <span className="text-gray-700 flex-1 truncate">{r.name}</span>
                      <span className="text-gray-400 shrink-0">{r.employmentStatus}</span>
                    </div>
                  ))}
                  {csvRows.length > 10 && (
                    <p className="text-xs text-gray-400 text-center">... dan {csvRows.length - 10} lainnya</p>
                  )}
                </div>
              </div>
            )}

            {importResult && (
              <div className="bg-green-50 rounded-lg p-3 space-y-1">
                <div className="flex items-center gap-2 text-green-700 text-sm font-semibold">
                  <CheckCircle2 size={16} /> Import selesai
                </div>
                <p className="text-xs text-green-600">✓ {importResult.ok} karyawan berhasil diimport</p>
                {importResult.skip > 0 && (
                  <p className="text-xs text-amber-600">⚠ {importResult.skip} dilewati (NIK sudah ada)</p>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setModal("none")}>Tutup</Button>
            <Button size="sm" onClick={handleImport} disabled={isPending || csvRows.length === 0} className="gap-2">
              {isPending ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {isPending ? "Mengimport..." : `Import ${csvRows.length} Karyawan`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
