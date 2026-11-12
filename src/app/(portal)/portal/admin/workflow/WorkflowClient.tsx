"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, GitBranch, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { T, useT } from "@/components/i18n";
import {
  CHAIN_VALUE, chainTitle, LEVEL_TYPES, levelTitle, MAX_LEVELS, ROLE_OPTIONS, WORKFLOW_MODULES,
  type LevelType, type WorkflowKey, type WorkflowLevel, type WorkflowSettings,
} from "@/lib/workflow";
import { saveWorkflow } from "./actions";

type UserOption = { id: string; name: string; employeeId: string };
const select = "h-9 w-full rounded-lg border border-input bg-white px-2 text-sm";

// Workflow per modul (Admin): Level 1..3, approver berdasarkan jabatan, hak akses, atau karyawan tertentu.
export default function WorkflowClient({ settings, users }: { settings: WorkflowSettings; users: UserOption[] }) {
  const t = useT();
  const [s, setS] = useState(settings);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const setMod = (k: WorkflowKey, patch: Partial<WorkflowSettings[WorkflowKey]>) => { setMsg(null); setS((x) => ({ ...x, [k]: { ...x[k], ...patch } })); };
  const setLevel = (k: WorkflowKey, i: number, patch: Partial<WorkflowLevel>) =>
    setMod(k, { levels: s[k].levels.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  const valueOptions = (type: LevelType) =>
    type === "ROLE" ? ROLE_OPTIONS.map((r) => ({ value: r.value, label: t(r.label) }))
      : users.map((u) => ({ value: u.id, label: u.employeeId ? `${u.employeeId} - ${u.name}` : u.name }));
  // Level baru default: atasan di bagan organisasi (Pra-Karyawan: mulai dari "Calon atasan langsung" di data calon).
  const newLevel = (): WorkflowLevel => ({ type: "POSITION", value: CHAIN_VALUE, label: "" });
  // Level jabatan ke-n (dihitung hanya di antara level jabatan) → "Atasan langsung", "Atasan dari atasan", …
  const chainIndex = (levels: WorkflowLevel[], i: number) => levels.slice(0, i + 1).filter((l) => l.type === "POSITION").length;

  return (
    <div className="min-h-full bg-gray-50">
      <div className="border-b border-gray-100 bg-white px-6 py-4">
        <h2 className="flex items-center gap-2 font-bold text-gray-800"><GitBranch size={18} /> <T>Workflow</T></h2>
        <p className="mt-0.5 text-xs text-gray-400"><T>Atur siapa yang menyetujui pengajuan per modul. Modul yang aktif menggantikan atasan langsung di profil karyawan; yang tidak aktif tetap ke atasan langsung.</T></p>
      </div>
      <main className="max-w-4xl space-y-3 px-4 py-5 sm:px-6">
        {WORKFLOW_MODULES.map((m) => {
          const mod = s[m.key];
          const soon = "soon" in m;
          return (
            <section key={m.key} className={`rounded-2xl border bg-white p-4 ${mod.enabled ? "border-brand/40" : "border-gray-200"} ${soon ? "opacity-60" : ""}`}>
              <label className={`flex items-start gap-3 ${soon ? "" : "cursor-pointer"}`}>
                <input type="checkbox" disabled={soon} checked={mod.enabled}
                  onChange={(e) => setMod(m.key, { enabled: e.target.checked, levels: e.target.checked && !mod.levels.length ? [newLevel()] : mod.levels })}
                  className="mt-1 h-4 w-4 accent-[#BE353F]" />
                <span className="min-w-0">
                  <span className="flex items-center gap-2 font-semibold text-gray-900"><T>{m.label}</T>
                    {soon ? <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500"><T>Segera</T></span>
                      : <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${mod.enabled ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                        <T>{mod.enabled ? "Aktif" : m.key === "PRA_KARYAWAN" ? "Belum diatur" : "Default: atasan langsung"}</T></span>}
                  </span>
                  <span className="block text-xs text-gray-500"><T>{m.desc}</T></span>
                </span>
              </label>

              {mod.enabled && (
                <div className="mt-3 space-y-2 pl-7">
                  {mod.levels.map((l, i) => (
                    <div key={i} className="grid items-center gap-2 rounded-xl bg-gray-50 p-2 sm:grid-cols-[70px_200px_1fr_32px]">
                      <span className="text-xs font-semibold text-gray-600"><T>Level</T> {i + 1}</span>
                      <select value={l.type} onChange={(e) => { const type = e.target.value as LevelType; setLevel(m.key, i, { type, value: type === "POSITION" ? CHAIN_VALUE : "", label: "" }); }} className={select}>
                        {LEVEL_TYPES.map((x) => <option key={x.value} value={x.value}>{t(x.label)}</option>)}
                      </select>
                      {l.type === "POSITION" ? (
                        <p title={t("Mengikuti bagan organisasi pemohon")} className="flex h-9 items-center truncate whitespace-nowrap rounded-lg border border-dashed border-gray-300 bg-white px-3 text-sm font-medium text-gray-700">
                          <T>{m.key === "PRA_KARYAWAN" ? (chainIndex(mod.levels, i) === 1 ? "Calon atasan langsung" : chainIndex(mod.levels, i) === 2 ? "Atasan dari calon atasan" : chainTitle(chainIndex(mod.levels, i))) : chainTitle(chainIndex(mod.levels, i))}</T>
                        </p>
                      ) : (
                        <select value={l.value} onChange={(e) => setLevel(m.key, i, { value: e.target.value, label: users.find((u) => u.id === e.target.value)?.name ?? "" })} className={select}>
                          <option value="">{t(l.type === "ROLE" ? "Pilih hak akses" : "Pilih karyawan")}</option>
                          {valueOptions(l.type).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      )}
                      <button type="button" aria-label={t("Hapus")} onClick={() => setMod(m.key, { levels: mod.levels.filter((_, j) => j !== i) })}
                        className="justify-self-end rounded p-1.5 text-gray-400 hover:text-rose-600"><Trash2 size={14} /></button>
                    </div>
                  ))}
                  {mod.levels.length < MAX_LEVELS && (
                    <button type="button" onClick={() => setMod(m.key, { levels: [...mod.levels, newLevel()] })}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline"><Plus size={12} /> <T>Tambah level</T></button>
                  )}
                  {mod.levels.some((l) => l.value) && (
                    <p className="text-[11px] text-gray-500">
                      <T>Alur</T>: {mod.levels.map((l, i) => ({ l, i })).filter(({ l }) => l.value)
                        .map(({ l, i }) => (l.type === "EMPLOYEE" ? l.label : l.type === "POSITION" ? t(chainTitle(chainIndex(mod.levels, i))) : t(levelTitle(l)))).join(" → ")}
                    </p>
                  )}
                </div>
              )}
            </section>
          );
        })}

        <div className="rounded-xl bg-white/80 px-4 py-3 text-[11px] leading-relaxed text-gray-500">
          <T>Berdasarkan jabatan: mengikuti bagan organisasi pemohon. Level jabatan pertama = atasan langsung (sesuai profil karyawan), berikutnya = atasan dari atasan, dan seterusnya. Atasan yang kosong atau tidak aktif dilewati, naik ke atasnya. Berdasarkan hak akses: salah satu pemegang hak akses itu.</T>
        </div>

        {msg && <p className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{msg.ok && <CheckCircle2 size={14} />}<T>{msg.text}</T></p>}
        <Button disabled={pending} className="gap-1.5" onClick={() => start(async () => {
          const cleaned = Object.fromEntries(Object.entries(s).map(([k, mod]) => [k, { ...mod, levels: mod.levels.filter((l) => l.value) }])) as WorkflowSettings;
          const r = await saveWorkflow(cleaned);
          setMsg(r.error ? { ok: false, text: r.error } : { ok: true, text: "Workflow tersimpan. Berlaku untuk pengajuan baru." });
        })}>{pending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} <T>Simpan</T></Button>
      </main>
    </div>
  );
}
