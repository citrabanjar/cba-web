"use client";

import { useState, useTransition, useRef } from "react";
import {
  Search, Plus, Upload, Download, X, ChevronLeft,
  User, CheckCircle2, XCircle, AlertCircle, Loader2,
} from "lucide-react";
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
const ROLE_COLOR: Record<string, string> = {
  KARYAWAN: "bg-gray-100 text-gray-600",
  HRD: "bg-green-100 text-green-700",
  MANAGER: "bg-blue-100 text-blue-700",
  ADMIN: "bg-red-100 text-red-700",
};
const STATUS_COLOR: Record<string, string> = {
  TETAP: "bg-emerald-100 text-emerald-700",
  KONTRAK: "bg-amber-100 text-amber-700",
  PROBATION: "bg-orange-100 text-orange-700",
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

export default function KaryawanClient({ employees: initial, depts }: { employees: Employee[]; depts: Dept[] }) {
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
      // Refresh employee list
      window.location.reload();
    });
  }

  const field = (key: keyof EmployeeInput, label: string, opts?: { type?: string; options?: string[] }) => (
    <div>
      <label className="text-xs font-medium text-gray-500 block mb-1">{label}</label>
      {opts?.options ? (
        <select
          value={(form[key] as string) ?? ""}
          onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
        >
          {opts.options.map(o => <option key={o}>{o}</option>)}
        </select>
      ) : (
        <input
          type={opts?.type ?? "text"}
          value={(form[key] as string) ?? ""}
          onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
        />
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-[#1e3a5f] text-white px-4 py-4 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <a href="/portal/dashboard" className="text-blue-200 hover:text-white">
            <ChevronLeft size={22} />
          </a>
          <div className="flex-1">
            <h1 className="font-bold text-base">Admin — Data Karyawan</h1>
            <p className="text-blue-200 text-xs">{employees.length} karyawan terdaftar</p>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-5 space-y-4">
        {/* Action buttons */}
        <div className="flex gap-2 flex-wrap">
          <button onClick={openAdd}
            className="flex items-center gap-1.5 bg-[#1e3a5f] text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-blue-800 transition-colors">
            <Plus size={15} /> Tambah
          </button>
          <button onClick={() => { setModal("upload"); setCsvRows([]); setImportResult(null); }}
            className="flex items-center gap-1.5 bg-white border border-gray-200 text-gray-700 text-sm font-medium px-4 py-2 rounded-xl hover:bg-gray-50 transition-colors">
            <Upload size={15} /> Upload CSV
          </button>
          <button onClick={downloadTemplate}
            className="flex items-center gap-1.5 bg-white border border-gray-200 text-gray-700 text-sm font-medium px-4 py-2 rounded-xl hover:bg-gray-50 transition-colors">
            <Download size={15} /> Template
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Cari NIK, nama, jabatan, departemen..."
            className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
          />
        </div>

        {/* Employee list */}
        <div className="space-y-2">
          {filtered.length === 0 && (
            <div className="text-center py-10 text-gray-400 text-sm">
              {search ? "Tidak ada karyawan yang cocok." : "Belum ada karyawan. Tambah atau upload CSV."}
            </div>
          )}
          {filtered.map(emp => (
            <div key={emp.id} className={`bg-white rounded-2xl border p-4 ${!emp.isActive ? "opacity-60 border-gray-100" : "border-gray-100 shadow-sm"}`}>
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-[#1e3a5f]/10 flex items-center justify-center shrink-0 mt-0.5">
                  <User size={16} className="text-[#1e3a5f]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-800 text-sm">{emp.name}</span>
                    {!emp.isActive && <span className="text-xs text-red-500 font-medium">NONAKTIF</span>}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">{emp.employeeId} · {emp.email ?? "—"}</p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {emp.department && (
                      <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{emp.department.name}</span>
                    )}
                    {emp.position && (
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{emp.position}</span>
                    )}
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[emp.employmentStatus] ?? "bg-gray-100 text-gray-600"}`}>
                      {emp.employmentStatus}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLOR[emp.role] ?? "bg-gray-100 text-gray-600"}`}>
                      {emp.role}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex gap-2 mt-3 pt-3 border-t border-gray-50">
                <button onClick={() => openEdit(emp)}
                  className="flex-1 text-xs font-medium text-[#1e3a5f] bg-blue-50 py-1.5 rounded-lg hover:bg-blue-100 transition-colors">
                  Edit
                </button>
                <button onClick={() => handleToggle(emp)} disabled={isPending}
                  className={`flex-1 text-xs font-medium py-1.5 rounded-lg transition-colors ${emp.isActive
                    ? "text-red-600 bg-red-50 hover:bg-red-100"
                    : "text-green-600 bg-green-50 hover:bg-green-100"}`}>
                  {emp.isActive ? "Nonaktifkan" : "Aktifkan"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* Add/Edit Modal */}
      {(modal === "add" || modal === "edit") && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center">
          <div className="bg-white w-full max-w-lg rounded-t-3xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
              <h2 className="font-bold text-gray-800">{modal === "add" ? "Tambah Karyawan" : "Edit Karyawan"}</h2>
              <button onClick={() => setModal("none")}><X size={20} className="text-gray-400" /></button>
            </div>
            <div className="overflow-y-auto px-5 py-4 space-y-3 flex-1">
              {msg && (
                <div className={`text-sm px-4 py-3 rounded-xl ${msg.type === "err" ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>
                  {msg.text}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                {field("employeeId", "NIK *")}
                {field("name", "Nama Lengkap *")}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {field("email", "Email", { type: "email" })}
                {field("phone", "No HP")}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {field("departmentName", "Departemen")}
                {field("position", "Jabatan")}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {field("employmentStatus", "Status Kerja", { options: STATUSES })}
                {field("role", "Role", { options: ROLES })}
              </div>
              {field("joinDate", "Tanggal Masuk", { type: "date" })}
              {field("password", modal === "add" ? "Password *" : "Password Baru (kosongkan jika tidak diganti)", { type: "password" })}
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide pt-1">Info Bank</p>
              <div className="grid grid-cols-2 gap-3">
                {field("bankName", "Nama Bank")}
                {field("bankAccount", "No Rekening")}
              </div>
              {field("bankHolder", "Nama Pemilik Rekening")}
            </div>
            <div className="px-5 py-4 border-t border-gray-100">
              <button onClick={handleSave} disabled={isPending}
                className="w-full bg-[#1e3a5f] text-white font-semibold py-3 rounded-xl hover:bg-blue-800 transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
                {isPending && <Loader2 size={16} className="animate-spin" />}
                {modal === "add" ? "Simpan Karyawan" : "Simpan Perubahan"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSV Upload Modal */}
      {modal === "upload" && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center">
          <div className="bg-white w-full max-w-lg rounded-t-3xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
              <h2 className="font-bold text-gray-800">Upload CSV Karyawan</h2>
              <button onClick={() => setModal("none")}><X size={20} className="text-gray-400" /></button>
            </div>
            <div className="overflow-y-auto px-5 py-4 space-y-4 flex-1">
              {/* Instructions */}
              <div className="bg-blue-50 rounded-xl p-3 text-xs text-blue-700 space-y-1">
                <p className="font-semibold">Format CSV:</p>
                <p>NIK, Nama, Email, No HP, Departemen, Jabatan, Status Kerja, Role, Tanggal Masuk, Password, No Rekening, Nama Bank, Nama Pemilik Rekening</p>
                <p className="text-blue-500">• Status Kerja: TETAP / KONTRAK / PROBATION</p>
                <p className="text-blue-500">• Role: KARYAWAN / HRD / MANAGER / ADMIN</p>
                <p className="text-blue-500">• Tanggal: YYYY-MM-DD (mis. 2024-01-15)</p>
                <p className="text-blue-500">• NIK yang sudah ada akan dilewati</p>
              </div>

              <button onClick={downloadTemplate}
                className="w-full flex items-center justify-center gap-2 border border-dashed border-gray-300 text-gray-600 text-sm py-2.5 rounded-xl hover:bg-gray-50 transition-colors">
                <Download size={15} /> Download Template CSV
              </button>

              {/* File input */}
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">Pilih File CSV</label>
                <input ref={fileRef} type="file" accept=".csv,text/csv"
                  onChange={handleFileChange}
                  className="w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:bg-[#1e3a5f] file:text-white file:text-xs file:font-medium hover:file:bg-blue-800 cursor-pointer" />
              </div>

              {/* Preview */}
              {csvRows.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-2">{csvRows.length} data siap diimport:</p>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {csvRows.slice(0, 10).map((r, i) => (
                      <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-1.5 text-xs">
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

              {/* Import result */}
              {importResult && (
                <div className="bg-green-50 rounded-xl p-3 space-y-1">
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
            <div className="px-5 py-4 border-t border-gray-100">
              <button onClick={handleImport} disabled={isPending || csvRows.length === 0}
                className="w-full bg-[#1e3a5f] text-white font-semibold py-3 rounded-xl hover:bg-blue-800 transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
                {isPending ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                {isPending ? "Mengimport..." : `Import ${csvRows.length} Karyawan`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
