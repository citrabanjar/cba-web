"use client";

// Pengaturan -> Import Data: data dasar (parameter organisasi, data karyawan). Karyawan baru masuk lewat Pra-Karyawan.
// Import foto, saldo cuti, dan saldo pinjaman ada di modulnya (Data Karyawan, Leave, Pinjaman).
// Super Admin mencentang "Beri Akses" per jenis: yang dicentang bisa dipakai Admin berkewenangan Import Data.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, CheckCircle2, FileStack, Loader2, Users, type LucideIcon } from "lucide-react";
import { T } from "@/components/i18n";
import { IMPORT_KINDS, type ImportKind } from "@/lib/import-kinds";
import type { MasterOptions } from "@/lib/master-data";
import EmployeeImportDialog from "../karyawan/EmployeeImportDialog";
import OrgImport from "../setup/OrgImport";
import PriorTaxImport from "./PriorTaxImport";
import { saveImportAccess } from "./import-actions";

export type ImportData = {
  kinds: ImportKind[]; enabled: ImportKind[] | null; // enabled: hanya untuk Super Admin (centang Beri Akses)
  master: MasterOptions;
  employeeIds: string[];
  org: { branch: string[]; department: string[]; position: string[] };
};

const ICON: Record<ImportKind, LucideIcon> = {
  organisasi: Building2, karyawan: Users, pph21pindahan: FileStack,
};

export default function ImportDataTab({ data }: { data: ImportData }) {
  const router = useRouter();
  const [open, setOpen] = useState<ImportKind | null>(null);
  const [enabled, setEnabled] = useState<ImportKind[]>(data.enabled ?? []);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const superAdmin = data.enabled !== null;
  const done = (changed: boolean) => { setOpen(null); if (changed) router.refresh(); };

  const toggle = (k: ImportKind, on: boolean) => {
    const next = on ? [...enabled, k] : enabled.filter((x) => x !== k);
    setEnabled(next); setMsg(null);
    start(async () => {
      const r = await saveImportAccess(next);
      setMsg(r.error ? { ok: false, text: r.error } : { ok: true, text: "Akses import tersimpan." });
      if (r.error) setEnabled(enabled);
    });
  };

  const list = IMPORT_KINDS.filter((k) => data.kinds.includes(k.key));
  return (
    <div className="space-y-3">
      {msg && <p className={`flex items-center gap-1 text-xs ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.ok && <CheckCircle2 size={13} />}<T>{msg.text}</T></p>}
      {list.length === 0 && <p className="rounded-2xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-400"><T>Belum ada kewenangan import.</T></p>}
      <div className="grid gap-3 md:grid-cols-2">
        {list.map((k) => {
          const Icon = ICON[k.key];
          return (
            <div key={k.key} className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand"><Icon size={17} /></span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-gray-900"><T>{k.label}</T></p>
                  <p className="text-xs text-gray-500"><T>{k.desc}</T></p>
                </div>
                {superAdmin && (
                  <label className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-gray-200 px-2.5 py-1 text-[11px] font-semibold text-gray-600">
                    <input type="checkbox" checked={enabled.includes(k.key)} disabled={pending} onChange={(e) => toggle(k.key, e.target.checked)} className="h-3.5 w-3.5 accent-[var(--color-brand)]" />
                    <T>Beri Akses</T>
                  </label>
                )}
              </div>
              <div>
                <button type="button" onClick={() => setOpen(k.key)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full bg-ink px-4 text-xs font-semibold text-white hover:bg-ink/85">
                  {pending && open === k.key ? <Loader2 size={14} className="animate-spin" /> : <Icon size={14} />} <T>Buka Import</T>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {open === "karyawan" && <EmployeeImportDialog master={data.master} employeeIds={data.employeeIds} onClose={done} />}
      {open === "organisasi" && <OrgImport existing={data.org} onClose={() => done(true)} />}
      {open === "pph21pindahan" && <PriorTaxImport onClose={done} />}
    </div>
  );
}
