"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Bot, CheckCircle2, GitBranch, Loader2, Save, UserPlus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { T } from "@/components/i18n";
import type { OnboardingSettings as Settings } from "@/lib/onboarding-interview";
import { saveFeatures } from "./onboarding-actions";

function Choice({ active, title, desc, onClick }: { active: boolean; title: string; desc: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className={`flex-1 rounded-xl border p-3 text-left transition ${active ? "border-brand bg-brand/5 ring-1 ring-brand" : "border-gray-200 hover:bg-gray-50"}`}>
      <span className="flex items-center gap-2 text-sm font-semibold text-gray-800">
        <span className={`h-3.5 w-3.5 rounded-full border-2 ${active ? "border-brand bg-brand" : "border-gray-300"}`} /> <T>{title}</T>
      </span>
      <span className="mt-1 block text-xs text-gray-500"><T>{desc}</T></span>
    </button>
  );
}

function Feature({ icon: Icon, title, desc, checked, onChange, children }: {
  icon: typeof GitBranch; title: string; desc: string; checked: boolean; onChange: (v: boolean) => void; children?: React.ReactNode;
}) {
  return (
    <section className={`rounded-2xl border p-4 ${checked ? "border-brand/40" : "border-gray-200"}`}>
      <label className="flex cursor-pointer items-start gap-3">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1 h-4 w-4 accent-[#BE353F]" />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 font-semibold text-gray-900"><Icon size={16} /> <T>{title}</T>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${checked ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}><T>{checked ? "Aktif" : "Nonaktif"}</T></span>
          </span>
          <span className="block text-xs text-gray-500"><T>{desc}</T></span>
        </span>
      </label>
      {checked && children && <div className="mt-3 space-y-3 pl-7">{children}</div>}
    </section>
  );
}

// Pengaturan → Fitur (Super Admin): pilih fitur yang dipakai perusahaan.
export default function OnboardingSettings({ settings, workflow: wf, agent: ag }: { settings: Settings; workflow: boolean; agent: boolean }) {
  const [s, setS] = useState<Settings>(settings);
  const [workflow, setWorkflow] = useState(wf);
  const [agent, setAgent] = useState(ag);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const set = (patch: Partial<Settings>) => { setMsg(null); setS((x) => ({ ...x, ...patch })); };

  return (
    <Card className="border-gray-100">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold uppercase tracking-wide text-gray-600"><T>Fitur</T></CardTitle>
        <p className="text-xs text-gray-400"><T>Pilih fitur yang dipakai perusahaan. Fitur yang dimatikan menunya disembunyikan.</T></p>
      </CardHeader>
      <CardContent className="space-y-3">
        <Feature icon={GitBranch} title="Workflow" checked={workflow} onChange={(v) => { setMsg(null); setWorkflow(v); }}
          desc="Atur approval per modul (Level 1, 2, 3) yang menggantikan atasan langsung. Nonaktif: semua pengajuan disetujui atasan langsung di profil karyawan.">
          <Link href="/portal/admin/workflow" className="inline-flex rounded-full border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50"><T>Buka menu Workflow</T></Link>
        </Feature>

        <Feature icon={UserPlus} title="Pra-Karyawan (onboarding)" checked={s.enabled} onChange={(v) => set({ enabled: v })}
          desc="Calon karyawan mengisi data sendiri, diperiksa HRD, disetujui sesuai Workflow, lalu didaftarkan. Nonaktif: menu disembunyikan dan karyawan baru ditambahkan lewat Data Karyawan.">
          <p className="text-xs font-semibold text-gray-700"><T>Tahap wawancara</T></p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Choice active={s.interview} title="Pakai wawancara" onClick={() => set({ interview: true })}
              desc="Calon diwawancara dulu. Hasil wawancara dan tawaran kerja (jabatan, status, gaji) disetujui approver, baru calon diundang mengisi data." />
            <Choice active={!s.interview} title="Tanpa wawancara" onClick={() => set({ interview: false })}
              desc="Calon langsung diundang mengisi data. Setelah HRD memeriksa, data calon disetujui sesuai menu Workflow." />
          </div>
          <p className="text-[11px] text-gray-500"><T>Approver Pra-Karyawan diatur di menu Workflow → Pra-Karyawan.</T></p>
        </Feature>

        <Feature icon={Bot} title="Agent HRD" checked={agent} onChange={(v) => { setMsg(null); setAgent(v); }}
          desc="AI (Claude) memeriksa ringkasan data portal secara terjadwal dan menulis temuan ke Task Admin. Nonaktif: tab Agent HRD disembunyikan, pemeriksaan berhenti, dan tidak ada biaya AI.">
          <p className="text-[11px] text-gray-500"><T>Jadwal pemeriksaan, Buku SOP, dan riwayat diatur di tab Agent HRD.</T></p>
        </Feature>

        {msg && <p className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{msg.ok && <CheckCircle2 size={14} />}<T>{msg.text}</T></p>}
        <Button disabled={pending} className="gap-1.5" onClick={() => start(async () => {
          const r = await saveFeatures({ workflow, agent, onboarding: s });
          if (!r.error && agent !== ag) window.location.reload();
          setMsg(r.error ? { ok: false, text: r.error } : { ok: true, text: "Fitur tersimpan." });
        })}>{pending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} <T>Simpan</T></Button>
      </CardContent>
    </Card>
  );
}
