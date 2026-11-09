"use client";

import { useMemo, useState, useTransition } from "react";
import { Coins, Loader2, MinusCircle, Pencil, Plus, Search, ShieldCheck, Trash2, UserPlus, Users, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { T, useT } from "@/components/i18n";
import { PAY_KINDS, categoryLabel, describe, legalWarning, type PayComponentInput } from "@/lib/payroll";
import { deletePayComponent, setComponentAssignments } from "./actions";
import ComponentDialog from "./ComponentDialog";

export type Component = Omit<PayComponentInput, "legalBasis" | "note"> & {
  id: string; legalBasis: string | null; note: string | null; sortOrder: number; updatedBy: string | null; employeeIds: string[];
};
export type PayEmployee = { id: string; name: string; employeeId: string; department: string | null };

const KIND_TONE: Record<string, { color: string; icon: React.ElementType }> = {
  PENDAPATAN: { color: "#10b981", icon: Coins },
  POTONGAN: { color: "#f43f5e", icon: MinusCircle },
  BENEFIT: { color: "#6366f1", icon: ShieldCheck },
};
// Tempel komponen ke karyawan (mirip tempel jadwal): centang karyawan yang mendapat komponen ini.
function AssignDialog({ comp, employees, onClose }: { comp: Component; employees: PayEmployee[]; onClose: () => void }) {
  const t = useT();
  const [picked, setPicked] = useState(() => new Set(comp.employeeIds));
  const [q, setQ] = useState("");
  const [dept, setDept] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const depts = useMemo(() => [...new Set(employees.map((e) => e.department).filter(Boolean) as string[])].sort(), [employees]);
  const shown = employees.filter((e) => (!dept || e.department === dept) && (!q || `${e.name} ${e.employeeId}`.toLowerCase().includes(q.toLowerCase())));
  const allShown = shown.length > 0 && shown.every((e) => picked.has(e.id));
  const toggle = (id: string, on: boolean) => setPicked((p) => { const n = new Set(p); if (on) n.add(id); else n.delete(id); return n; });
  function save() {
    setError(null);
    start(async () => {
      const r = await setComponentAssignments(comp.id, [...picked]);
      if (r.error) setError(r.error);
      else onClose();
    });
  }
  return (
    <Dialog open onOpenChange={(o: boolean) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader><DialogTitle><T>Tempel Komponen</T> · {comp.code} {t(comp.name)}</DialogTitle></DialogHeader>
        <p className="-mt-2 text-xs text-gray-500"><T>Hanya karyawan yang dicentang yang mendapat komponen ini saat Proses Gaji.</T></p>
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-40 flex-1">
            <Search size={14} className="absolute left-2.5 top-2.5 text-gray-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Cari nama / ID")} className="pl-8" />
          </div>
          <select value={dept} onChange={(e) => setDept(e.target.value)} className="h-9 rounded-lg border border-input bg-white px-2 text-sm">
            <option value="">{t("Semua departemen")}</option>
            {depts.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div className="flex items-center justify-between text-xs">
          <label className="flex cursor-pointer items-center gap-2 font-medium text-gray-700">
            <input type="checkbox" checked={allShown} onChange={(e) => shown.forEach((x) => toggle(x.id, e.target.checked))} className="h-4 w-4 accent-[var(--color-brand)]" />
            <T>Pilih semua</T> ({shown.length})
          </label>
          <span className="text-gray-500">{picked.size} <T>karyawan dipilih</T></span>
        </div>
        <ul className="max-h-80 divide-y divide-gray-50 overflow-y-auto rounded-xl border border-gray-200">
          {shown.map((e) => (
            <li key={e.id}>
              <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-gray-50">
                <input type="checkbox" checked={picked.has(e.id)} onChange={(x) => toggle(e.id, x.target.checked)} className="h-4 w-4 accent-[var(--color-brand)]" />
                <span className="min-w-0 flex-1"><span className="block text-sm text-gray-900">{e.name}</span>
                  <span className="block text-[11px] text-gray-400">{[e.employeeId, e.department].filter(Boolean).join(" · ")}</span></span>
              </label>
            </li>
          ))}
          {shown.length === 0 && <li className="px-3 py-6 text-center text-sm text-gray-400"><T>Tidak ada karyawan.</T></li>}
        </ul>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"><T>{error}</T></p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}><T>Batal</T></Button>
          <Button onClick={save} disabled={pending} className="gap-1.5">{pending && <Loader2 size={15} className="animate-spin" />} <T>Simpan</T></Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ComponentsTab({ components, employees, workDaysPerWeek }: { components: Component[]; employees: PayEmployee[]; workDaysPerWeek: 5 | 6 }) {
  const t = useT();
  const [editing, setEditing] = useState<Component | "new" | null>(null);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const assignComp = components.find((c) => c.id === assigning);
  function remove(c: Component) {
    if (!window.confirm(t("Hapus komponen ini?"))) return;
    start(async () => { await deletePayComponent(c.id); });
  }
  return (
    <section className="rounded-2xl border border-gray-200 bg-white">
      <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 px-5 py-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-rose-400 text-white"><Wallet size={17} /></span>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-gray-900"><T>Komponen Gaji & Benefit</T></h3>
          <p className="text-xs text-gray-400"><T>Setiap komponen menjadi kolom hasil Proses Gaji. Nilainya Input atau Rumus, lalu tempel ke karyawan yang mendapatkannya.</T></p>
        </div>
        <button type="button" onClick={() => setEditing("new")}
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-ink px-4 text-xs font-semibold text-white hover:bg-ink/85">
          <Plus size={14} /> <T>Tambah Komponen</T>
        </button>
      </div>
      {PAY_KINDS.map((k) => {
        const list = components.filter((c) => c.kind === k.key);
        if (list.length === 0) return null;
        const tone = KIND_TONE[k.key];
        return (
          <div key={k.key} className="border-b border-gray-100 p-4 last:border-b-0">
            <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <tone.icon size={14} style={{ color: tone.color }} /> <T>{k.label}</T> <span className="text-gray-300">{list.length}</span>
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              {list.map((c) => (
                <div key={c.id} className={`relative overflow-hidden rounded-2xl border border-gray-200 bg-white ${c.isActive ? "" : "opacity-55"}`}>
                  <span className="absolute inset-y-0 left-0 w-1.5" style={{ background: tone.color }} />
                  <div className="p-4 pl-5">
                    <div className="flex items-start gap-3">
                      <span className="flex h-9 min-w-12 items-center justify-center rounded-xl px-2 text-[11px] font-bold text-white" style={{ background: tone.color }}>{c.code}</span>
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-gray-900">{t(c.name)}</p>
                        <p className="text-xs text-gray-500"><T>{categoryLabel(c.category)}</T> · <T>{c.method === "INPUT" ? "Input" : c.method === "PPH21" ? "Sistem" : "Rumus"}</T>{!c.isActive && <> · <T>Nonaktif</T></>}</p>
                      </div>
                      <button type="button" onClick={() => setEditing(c)} aria-label={t("Ubah")} className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-brand"><Pencil size={14} /></button>
                      <button type="button" onClick={() => remove(c)} disabled={pending} aria-label={t("Hapus")} className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-brand disabled:opacity-30"><Trash2 size={14} /></button>
                    </div>
                    <p className="mt-3 text-sm font-semibold text-gray-900">{t(describe(c, workDaysPerWeek))}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <button type="button" onClick={() => setAssigning(c.id)}
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${c.employeeIds.length ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100" : "bg-amber-50 text-amber-700 hover:bg-amber-100"}`}>
                        {c.employeeIds.length ? <Users size={12} /> : <UserPlus size={12} />}
                        {c.employeeIds.length ? `${c.employeeIds.length} ${t("karyawan")}` : t("Belum ditempel")} · <T>Tempel</T>
                      </button>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${c.taxable ? "bg-amber-50 text-amber-700" : "bg-gray-100 text-gray-500"}`}>
                        <T>{c.taxable ? "Objek PPh 21" : "Bukan objek PPh 21"}</T>
                      </span>
                      {legalWarning(c, workDaysPerWeek) && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-600">{t(legalWarning(c, workDaysPerWeek)!)}</span>}
                      {c.kind === "PENDAPATAN" && c.params?.fixedWage && <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700"><T>Upah tetap</T></span>}
                      {c.kind === "PENDAPATAN" && c.params?.prorate && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600"><T>Prorata</T></span>}
                      {c.method === "THR" && <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700"><T>Tidak rutin</T></span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
      {editing && <ComponentDialog comp={editing} all={components} workDaysPerWeek={workDaysPerWeek} onClose={() => setEditing(null)} onCreated={setAssigning} />}
      {assignComp && <AssignDialog key={assignComp.id} comp={assignComp} employees={employees} onClose={() => setAssigning(null)} />}
    </section>
  );
}
