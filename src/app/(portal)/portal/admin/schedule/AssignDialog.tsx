"use client";

import { useMemo, useState, useTransition } from "react";
import { Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { T, useT } from "@/components/i18n";
import { assignSchedule } from "./actions";

export type EmployeeOption = { id: string; label: string; sub?: string; department?: string | null };

// Tempel satu pola kerja ke banyak karyawan sekaligus, bisa dipilih per departemen.
export default function AssignDialog({
  pattern, employees, onClose,
}: {
  pattern: { id: string; name: string }; employees: EmployeeOption[]; onClose: () => void;
}) {
  const t = useT();
  const [selected, setSelected] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [dept, setDept] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const departments = useMemo(
    () => [...new Set(employees.map((e) => e.department).filter(Boolean) as string[])].sort(),
    [employees],
  );
  const shown = employees.filter((e) =>
    (!dept || e.department === dept) &&
    (!q || `${e.label} ${e.sub ?? ""}`.toLowerCase().includes(q.toLowerCase())));
  const allShownSelected = shown.length > 0 && shown.every((e) => selected.includes(e.id));
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const toggleShown = () => setSelected((s) =>
    allShownSelected ? s.filter((id) => !shown.some((e) => e.id === id)) : [...new Set([...s, ...shown.map((e) => e.id)])]);

  function save() {
    setMsg(null);
    start(async () => {
      const r = await assignSchedule(selected, { type: "POLA", patternId: pattern.id, effectiveDate, note });
      if (r.error) setMsg({ ok: false, text: r.error });
      else onClose();
    });
  }

  return (
    <Dialog open onOpenChange={(o: boolean) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle><T>Tempel ke Karyawan</T>: {pattern.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs"><T>Mulai berlaku</T></Label>
              <Input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs"><T>Catatan</T></Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex flex-col gap-2 sm:flex-row">
              <select value={dept} onChange={(e) => setDept(e.target.value)}
                className="h-9 rounded-lg border border-input bg-white px-2 text-sm sm:w-56">
                <option value="">{t("Semua departemen")}</option>
                {departments.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Cari nama atau ID...")} className="pl-9" />
              </div>
            </div>
            <div className="flex items-center justify-between text-xs">
              <button type="button" onClick={toggleShown} className="font-semibold text-brand hover:underline">
                {allShownSelected ? <T>Batalkan pilihan yang tampil</T> : <T>Pilih semua yang tampil</T>}
              </button>
              <span className="text-gray-500">{selected.length} <T>karyawan dipilih</T></span>
            </div>
            <div className="max-h-64 space-y-1 overflow-y-auto rounded-xl border border-gray-200 p-2">
              {shown.length === 0 && <p className="py-2 text-xs text-gray-400"><T>Tidak ada data.</T></p>}
              {shown.map((e) => (
                <label key={e.id} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-gray-50">
                  <input type="checkbox" checked={selected.includes(e.id)} onChange={() => toggle(e.id)} className="h-4 w-4 accent-[var(--color-brand)]" />
                  <span className="min-w-0 flex-1 truncate text-sm text-gray-800">{e.label}</span>
                  <span className="shrink-0 text-xs text-gray-400">{e.sub}</span>
                </label>
              ))}
            </div>
          </div>
          {msg && <p className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}><T>{msg.text}</T></p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}><T>Batal</T></Button>
          <Button onClick={save} disabled={pending || selected.length === 0} className="gap-1.5">
            {pending && <Loader2 size={15} className="animate-spin" />} <T>Tempel</T> ({selected.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
