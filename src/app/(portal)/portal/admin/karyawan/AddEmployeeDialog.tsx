"use client";

// Tambah satu karyawan lewat formulir (Pengaturan -> Import Data -> Tambah Karyawan).
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createEmployee, type EmployeeInput } from "./actions";
import type { MasterOptions } from "@/lib/master-data";
import { BANK_OPTIONS } from "@/lib/personal-info";
import EmployeeCombobox from "@/components/portal/EmployeeCombobox";
import { T } from "@/components/i18n";

const STATUSES = ["KONTRAK", "TETAP"];
const EMPTY: Partial<EmployeeInput> = {
  employeeId: "", name: "", email: "", phone: "",
  branch: "", departmentName: "", position: "", employmentStatus: "KONTRAK",
  joinDate: "", password: "",
  bankName: "", bankAccount: "", bankHolder: "",
};

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

export default function AddEmployeeDialog({ master, onClose }: { master: MasterOptions; onClose: (changed: boolean) => void }) {
  const [form, setForm] = useState<Partial<EmployeeInput>>({ ...EMPTY });
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    if (!form.employeeId?.trim() || !form.name?.trim()) {
      setMsg({ type: "err", text: "ID Karyawan dan Nama wajib diisi." });
      return;
    }
    startTransition(async () => {
      try {
        await createEmployee(form as EmployeeInput);
        setForm({ ...EMPTY });
        setMsg({ type: "ok", text: "Karyawan tersimpan. Isi data lengkapnya di menu Data Karyawan." });
      } catch {
        setMsg({ type: "err", text: "Gagal menyimpan. ID Karyawan atau email mungkin sudah dipakai." });
      }
    });
  }

  return (
  <Dialog open onOpenChange={(open: boolean) => { if (!open) onClose(false); }}>
    <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto sm:max-w-lg">
      <DialogHeader>
        <DialogTitle><T>Tambah Karyawan</T></DialogTitle>
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
            <T>Password (opsional)</T>
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
        <Button variant="outline" size="sm" onClick={() => onClose(false)}><T>Batal</T></Button>
        <Button size="sm" onClick={handleSave} disabled={isPending} className="gap-2">
          {isPending && <Loader2 size={14} className="animate-spin" />}
          <T>Simpan Karyawan</T>
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
  );
}
