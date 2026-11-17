"use client";

import { useState, useTransition } from "react";
import { ArrowLeftRight, Briefcase, CalendarDays, ChevronRight, GitBranch, HandCoins, Loader2, Plus, Save, Timer, Trash2, UserPen, type LucideIcon } from "lucide-react";
import { toast } from "@/components/portal/Toast";
import { Button } from "@/components/ui/button";
import { T, useT } from "@/components/i18n";
import {
  CHAIN_VALUE, chainTitle, LEVEL_TYPES, levelTitle, MAX_LEVELS, ROLE_GROUP_PREFIX, ROLE_OPTIONS, WORKFLOW_MODULES,
  type LevelType, type WorkflowKey, type WorkflowLevel, type WorkflowSettings,
} from "@/lib/workflow";
import { saveWorkflow } from "./actions";
import { useCanEdit } from "@/components/portal/edit-access";

type UserOption = { id: string; name: string; employeeId: string };
const select = "h-9 w-full rounded-lg border border-input bg-white px-2 text-sm";
const ICONS: Record<WorkflowKey, LucideIcon> = { CUTI: CalendarDays, DINAS: Briefcase, LEMBUR: Timer, PINJAMAN: HandCoins, TUKAR_SHIFT: ArrowLeftRight, PERUBAHAN_DATA: UserPen };

// Workflow per modul (Admin): Level 1..3, approver berdasarkan jabatan, hak akses, atau karyawan tertentu.
export default function WorkflowClient({ settings, users, groups = [] }: { settings: WorkflowSettings; users: UserOption[]; groups?: { id: string; name: string }[] }) {
  const t = useT();
  const canEdit = useCanEdit(); // hak lihat saja: isian dikunci, tombol ubah disembunyikan
  const [s, setS] = useState(settings);
  const [pending, start] = useTransition();
  // Daftar modul di kiri, pengaturan modul terpilih di kanan (seperti Komponen Payroll).
  const [sel, setSel] = useState<WorkflowKey>(() => WORKFLOW_MODULES.find((m) => settings[m.key].enabled)?.key ?? WORKFLOW_MODULES[0].key);
  const setMod = (k: WorkflowKey, patch: Partial<WorkflowSettings[WorkflowKey]>) => setS((x) => ({ ...x, [k]: { ...x[k], ...patch } }));
  const setLevel = (k: WorkflowKey, i: number, patch: Partial<WorkflowLevel>) =>
    setMod(k, { levels: s[k].levels.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  const valueOptions = (type: LevelType) =>
    type === "ROLE" ? [
      ...groups.map((g) => ({ value: `${ROLE_GROUP_PREFIX}${g.id}`, label: `${t("Peran")}: ${g.name}` })),
      ...ROLE_OPTIONS.map((r) => ({ value: r.value, label: t(r.label) })),
    ]
      : users.map((u) => ({ value: u.id, label: u.employeeId ? `${u.employeeId} - ${u.name}` : u.name }));
  // Level baru default: atasan di bagan organisasi.
  const newLevel = (): WorkflowLevel => ({ type: "POSITION", value: CHAIN_VALUE, label: "" });
  // Level jabatan ke-n (dihitung hanya di antara level jabatan) → "Atasan langsung", "Atasan dari atasan", …
  const chainIndex = (levels: WorkflowLevel[], i: number) => levels.slice(0, i + 1).filter((l) => l.type === "POSITION").length;

  return (
    <div className="min-h-full bg-gray-50">
      <div className="border-b border-gray-100 bg-white px-6 py-4">
        <h2 className="flex items-center gap-2 font-bold text-gray-800"><GitBranch size={18} /> <T>Workflow</T></h2>
        <p className="mt-0.5 text-xs text-gray-400"><T>Atur siapa yang menyetujui pengajuan per modul. Modul yang aktif menggantikan atasan langsung di profil karyawan; yang tidak aktif tetap ke atasan langsung.</T></p>
      </div>
      <main className="grid max-w-6xl gap-4 px-4 py-5 sm:px-6 md:grid-cols-[18rem_1fr]">
        <nav className="h-fit overflow-hidden rounded-2xl border border-gray-200 bg-white">
          {WORKFLOW_MODULES.map((m) => {
            const on = m.key === sel, soon = "soon" in m, Icon = ICONS[m.key];
            return (
              <button key={m.key} type="button" onClick={() => setSel(m.key)}
                className={`flex w-full items-center gap-3 border-b border-gray-100 px-4 py-3 text-left last:border-b-0 ${on ? "bg-brand/10" : "hover:bg-gray-50"} ${soon ? "opacity-55" : ""}`}>
                <Icon size={17} className={on ? "text-brand" : "text-gray-400"} />
                <span className={`min-w-0 flex-1 truncate text-sm ${on ? "font-semibold text-brand" : "text-gray-700"}`}><T>{m.label}</T></span>
                {soon ? <span className="text-[10px] font-semibold text-gray-400"><T>Segera</T></span>
                  : s[m.key].enabled ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700"><T>Aktif</T></span>
                  : <span className="text-[10px] text-gray-400"><T>Atasan langsung</T></span>}
                <ChevronRight size={14} className={on ? "text-brand" : "text-gray-300"} />
              </button>
            );
          })}
        </nav>

        {(() => {
          const m = WORKFLOW_MODULES.find((x) => x.key === sel)!;
          const mod = s[m.key];
          const soon = "soon" in m, Icon = ICONS[m.key];
          return (
            <section className="relative h-fit overflow-hidden rounded-2xl border border-gray-200 bg-white">
              <span className={`absolute inset-y-0 left-0 w-1.5 ${mod.enabled ? "bg-brand" : "bg-gray-300"}`} />
              <div className="space-y-4 p-4 pl-5">
                <div className="flex items-start gap-3">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white ${mod.enabled ? "bg-gradient-to-br from-brand to-rose-400" : "bg-gray-300"}`}><Icon size={17} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-bold text-gray-900"><T>{m.label}</T>
                      {soon ? <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500"><T>Segera</T></span>
                        : <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${mod.enabled ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                          <T>{mod.enabled ? "Aktif" : "Default: atasan langsung"}</T></span>}
                    </p>
                    <p className="text-xs text-gray-500"><T>{m.desc}</T></p>
                  </div>
                </div>

                <label className={`flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2.5 text-sm ${soon || !canEdit ? "" : "cursor-pointer hover:bg-gray-50"}`}>
                  <input type="checkbox" disabled={soon || !canEdit} checked={mod.enabled}
                    onChange={(e) => setMod(m.key, { enabled: e.target.checked, levels: e.target.checked && !mod.levels.length ? [newLevel()] : mod.levels })}
                    className="h-4 w-4 accent-[#BE353F]" />
                  <span className="min-w-0">
                    <span className="block font-medium text-gray-800"><T>Pakai workflow untuk modul ini</T></span>
                    <span className="block text-xs text-gray-400"><T>bila tidak dicentang, pengajuan ke atasan langsung</T></span>
                  </span>
                </label>

                {mod.enabled && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-gray-600"><T>Level persetujuan</T></p>
                    {mod.levels.map((l, i) => (
                      <div key={i} className="grid items-center gap-2 rounded-xl bg-gray-50 p-2 sm:grid-cols-[56px_minmax(0,1fr)_minmax(0,1.3fr)_28px]">
                        <span className="text-xs font-semibold text-gray-600"><T>Level</T> {i + 1}</span>
                        <select value={l.type} onChange={(e) => { const type = e.target.value as LevelType; setLevel(m.key, i, { type, value: type === "POSITION" ? CHAIN_VALUE : "", label: "" }); }} disabled={!canEdit} className={select}>
                          {LEVEL_TYPES.map((x) => <option key={x.value} value={x.value}>{t(x.label)}</option>)}
                        </select>
                        {l.type === "POSITION" ? (
                          <p title={t("Mengikuti bagan organisasi pemohon")} className="flex h-9 items-center truncate whitespace-nowrap rounded-lg border border-dashed border-gray-300 bg-white px-3 text-sm font-medium text-gray-700">
                            <T>{chainTitle(chainIndex(mod.levels, i))}</T>
                          </p>
                        ) : (
                          <select value={l.value} onChange={(e) => setLevel(m.key, i, { value: e.target.value, label: users.find((u) => u.id === e.target.value)?.name ?? groups.find((g) => `${ROLE_GROUP_PREFIX}${g.id}` === e.target.value)?.name ?? "" })} disabled={!canEdit} className={select}>
                            <option value="">{t(l.type === "ROLE" ? "Pilih hak akses" : "Pilih karyawan")}</option>
                            {valueOptions(l.type).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        )}
                        {canEdit && (
                          <button type="button" aria-label={t("Hapus")} onClick={() => setMod(m.key, { levels: mod.levels.filter((_, j) => j !== i) })}
                            className="justify-self-end rounded p-1.5 text-gray-400 hover:text-rose-600"><Trash2 size={14} /></button>
                        )}
                      </div>
                    ))}
                    {canEdit && mod.levels.length < MAX_LEVELS && (
                      <button type="button" onClick={() => setMod(m.key, { levels: [...mod.levels, newLevel()] })}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline"><Plus size={12} /> <T>Tambah level</T></button>
                    )}
                    {mod.levels.some((l) => l.value) && (
                      <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
                        <T>Alur</T>: <b>{mod.levels.map((l, i) => ({ l, i })).filter(({ l }) => l.value)
                          .map(({ l, i }) => (l.type === "EMPLOYEE" ? l.label : l.type === "POSITION" ? t(chainTitle(chainIndex(mod.levels, i))) : t(levelTitle(l)))).join(" → ")}</b>
                      </p>
                    )}
                  </div>
                )}

                <p className="border-t border-gray-100 pt-3 text-[11px] leading-relaxed text-gray-500">
                  <T>Berdasarkan jabatan: mengikuti bagan organisasi pemohon. Level jabatan pertama = atasan langsung (sesuai profil karyawan), berikutnya = atasan dari atasan, dan seterusnya. Atasan yang kosong atau tidak aktif dilewati, naik ke atasnya. Berdasarkan hak akses: salah satu pemegang hak akses itu.</T>
                </p>

                {canEdit && (
                  <div className="flex justify-end">
                    <Button disabled={pending} className="gap-1.5" onClick={() => start(async () => {
                      const cleaned = Object.fromEntries(Object.entries(s).map(([k, x]) => [k, { ...x, levels: x.levels.filter((l) => l.value) }])) as WorkflowSettings;
                      const r = await saveWorkflow(cleaned);
                      if (r.error) toast(t(r.error), "error");
                      else toast(t("Workflow tersimpan. Berlaku untuk pengajuan baru."), "ok");
                    })}>{pending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} <T>Simpan</T></Button>
                  </div>
                )}
              </div>
            </section>
          );
        })()}
      </main>
    </div>
  );
}
