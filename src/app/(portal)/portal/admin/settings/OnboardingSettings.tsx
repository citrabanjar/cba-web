"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, Save } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { T } from "@/components/i18n";
import type { OnboardingSettings as Settings } from "@/lib/onboarding-interview";
import { saveOnboardingSettings } from "./onboarding-actions";

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

// Setup Pra-Karyawan (Super Admin): modul aktif, tahap wawancara. Approver diatur di menu Workflow.
export default function OnboardingSettings({ settings }: { settings: Settings }) {
  const [s, setS] = useState<Settings>(settings);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const set = (patch: Partial<Settings>) => { setMsg(null); setS((x) => ({ ...x, ...patch })); };

  return (
    <Card className="border-gray-100">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold uppercase tracking-wide text-gray-600"><T>Setup Pra-Karyawan</T></CardTitle>
        <p className="text-xs text-gray-400"><T>Atur alur penerimaan calon karyawan: aktif atau tidak, dan pakai tahap wawancara atau tidak.</T></p>
      </CardHeader>
      <CardContent className="space-y-6">
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200 p-3">
          <input type="checkbox" checked={s.enabled} onChange={(e) => set({ enabled: e.target.checked })} className="mt-0.5 h-4 w-4 accent-[#BE353F]" />
          <span>
            <span className="block text-sm font-semibold text-gray-800"><T>Aktifkan modul Pra-Karyawan</T></span>
            <span className="block text-xs text-gray-500"><T>Matikan bila perusahaan tidak butuh onboarding di portal: menu Pra-Karyawan disembunyikan dan calon tidak bisa masuk ke halaman isi data. Karyawan baru tetap bisa ditambahkan lewat Data Karyawan.</T></span>
          </span>
        </label>

        {s.enabled && <>
        <section className="space-y-2">
          <p className="text-xs font-semibold text-gray-700">1. <T>Tahap wawancara</T></p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Choice active={s.interview} title="Pakai wawancara" onClick={() => set({ interview: true })}
              desc="Calon diwawancara dulu. Hasil wawancara dan tawaran kerja (jabatan, status, gaji) disetujui approver, baru calon diundang mengisi data." />
            <Choice active={!s.interview} title="Tanpa wawancara" onClick={() => set({ interview: false })}
              desc="Calon langsung diundang mengisi data. Setelah HRD memeriksa, data calon disetujui sesuai menu Workflow." />
          </div>
        </section>

        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-sky-100 bg-sky-50 px-4 py-3 text-xs text-sky-900">
          <span className="min-w-0 flex-1"><T>Siapa yang menyetujui (Level 1, 2, 3) diatur di menu Workflow → Pra-Karyawan.</T></span>
          <Link href="/portal/admin/workflow" className="rounded-full bg-white px-3 py-1 font-semibold text-sky-800 shadow-sm hover:bg-sky-100"><T>Buka Workflow</T></Link>
        </div>
            <div className="rounded-xl bg-gray-50 px-4 py-3 text-xs leading-relaxed text-gray-600">
              <p className="mb-1 font-semibold text-gray-700"><T>{s.interview ? "Alur dengan wawancara" : "Alur tanpa wawancara"}</T></p>
              <T>{s.interview
                ? "HRD daftarkan calon → isi hasil wawancara & tawaran kerja → approval → undangan isi data otomatis ke email calon → HRD periksa data → HRD isi Employee ID & penempatan → langsung masuk database sebagai karyawan."
                : "HRD undang calon → calon isi data → HRD periksa & lengkapi data pekerjaan → approval → HRD daftarkan karyawan → masuk database."}</T>
            </div>
        </>}

        {msg && <p className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{msg.ok && <CheckCircle2 size={14} />}<T>{msg.text}</T></p>}
        <Button disabled={pending} className="gap-1.5" onClick={() => start(async () => {
          const r = await saveOnboardingSettings(s);
          setMsg(r.error ? { ok: false, text: r.error } : { ok: true, text: "Setup Pra-Karyawan tersimpan." });
        })}>{pending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} <T>Simpan</T></Button>
      </CardContent>
    </Card>
  );
}
