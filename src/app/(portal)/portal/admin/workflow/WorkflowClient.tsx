"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, GitBranch, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { T, useT } from "@/components/i18n";
import { MAX_LEVELS, WORKFLOW_MODULES, type WorkflowKey, type WorkflowSettings } from "@/lib/workflow";
import { saveWorkflow } from "./actions";

type UserOption = { id: string; name: string; info: string };
const select = "h-9 w-full rounded-lg border border-input bg-white px-2 text-sm disabled:bg-gray-50 disabled:text-gray-400";

export default function WorkflowClient({ settings, users }: { settings: WorkflowSettings; users: UserOption[] }) {
  const t = useT();
  const [s, setS] = useState(settings);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const setMod = (k: WorkflowKey, patch: Partial<WorkflowSettings[WorkflowKey]>) => { setMsg(null); setS((x) => ({ ...x, [k]: { ...x[k], ...patch } })); };
  // Level diisi berurutan: mengosongkan satu level ikut mengosongkan level di bawahnya.
  const setLevel = (k: WorkflowKey, i: number, id: string) => {
    const before = s[k].levels.slice(0, i);
    const u = users.find((x) => x.id === id);
    setMod(k, { levels: u ? [...before, { id: u.id, name: u.name }, ...s[k].levels.slice(i + 1).filter((l) => l.id !== u.id)] : before });
  };

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
              <div className="flex items-start gap-3">
                <label className={`flex min-w-0 flex-1 items-start gap-3 ${soon ? "" : "cursor-pointer"}`}>
                  <input type="checkbox" disabled={soon} checked={mod.enabled} onChange={(e) => setMod(m.key, { enabled: e.target.checked })} className="mt-1 h-4 w-4 accent-[#BE353F]" />
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 font-semibold text-gray-900"><T>{m.label}</T>
                      {soon && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500"><T>Segera</T></span>}
                      {!soon && <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${mod.enabled ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}><T>{mod.enabled ? "Aktif" : m.key === "PRA_KARYAWAN" ? "Belum diatur" : "Default: atasan langsung"}</T></span>}
                    </span>
                    <span className="block text-xs text-gray-500"><T>{m.desc}</T></span>
                  </span>
                </label>
              </div>
              {mod.enabled && (
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {Array.from({ length: MAX_LEVELS }, (_, i) => {
                    const cur = mod.levels[i]?.id ?? "";
                    const usedElsewhere = new Set(mod.levels.filter((_, j) => j !== i).map((l) => l.id));
                    return (
                      <div key={i} className="space-y-1">
                        <p className="text-[11px] font-semibold text-gray-500"><T>Level</T> {i + 1}{i > 0 && <span className="font-normal text-gray-400"> · <T>opsional</T></span>}</p>
                        <select value={cur} disabled={i > mod.levels.length} onChange={(e) => setLevel(m.key, i, e.target.value)} className={select}>
                          <option value="">{t(i === 0 ? "Pilih karyawan" : "—")}</option>
                          {users.filter((u) => !usedElsewhere.has(u.id)).map((u) => <option key={u.id} value={u.id}>{u.name}{u.info ? ` · ${u.info}` : ""}</option>)}
                        </select>
                      </div>
                    );
                  })}
                </div>
              )}
              {mod.enabled && mod.levels.length > 0 && (
                <p className="mt-2 text-[11px] text-gray-500">
                  <T>Alur</T>: {mod.levels.map((l) => l.name).join(" → ")}. <T>Bila pemohon sendiri ada di salah satu level, level itu dilewati.</T>
                </p>
              )}
            </section>
          );
        })}

        {msg && <p className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{msg.ok && <CheckCircle2 size={14} />}<T>{msg.text}</T></p>}
        <Button disabled={pending} className="gap-1.5" onClick={() => start(async () => {
          const r = await saveWorkflow(s);
          setMsg(r.error ? { ok: false, text: r.error } : { ok: true, text: "Workflow tersimpan. Berlaku untuk pengajuan baru." });
        })}>{pending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} <T>Simpan</T></Button>
      </main>
    </div>
  );
}
