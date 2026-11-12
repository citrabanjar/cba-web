"use client";

import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, CheckCircle2, Loader2, Save, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { T, useT } from "@/components/i18n";
import type { ApprovalMode, ApprovalOrder, OnboardingSettings as Settings } from "@/lib/onboarding-interview";
import { saveOnboardingSettings } from "./onboarding-actions";

export type ApproverOption = { id: string; name: string; info: string };

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

// Setup Onboarding (Super Admin): tahap wawancara, model approval, daftar approver.
export default function OnboardingSettings({ settings, users }: { settings: Settings; users: ApproverOption[] }) {
  const t = useT();
  const [s, setS] = useState<Settings>(settings);
  const [pick, setPick] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const set = (patch: Partial<Settings>) => { setMsg(null); setS((x) => ({ ...x, ...patch })); };
  const max = s.mode === "TUNGGAL" ? 1 : 10;
  const add = () => {
    const u = users.find((x) => x.id === pick);
    if (!u || s.approvers.some((a) => a.id === u.id)) return;
    set({ approvers: s.mode === "TUNGGAL" ? [{ id: u.id, name: u.name }] : [...s.approvers, { id: u.id, name: u.name }].slice(0, max) });
    setPick("");
  };
  const move = (i: number, d: -1 | 1) => {
    const list = [...s.approvers];
    [list[i], list[i + d]] = [list[i + d], list[i]];
    set({ approvers: list });
  };
  const info = (id: string) => users.find((u) => u.id === id)?.info ?? "";

  return (
    <Card className="border-gray-100">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold uppercase tracking-wide text-gray-600"><T>Setup Pra-Karyawan</T></CardTitle>
        <p className="text-xs text-gray-400"><T>Atur alur penerimaan calon karyawan: pakai tahap wawancara atau tidak, dan siapa yang menyetujui hasil wawancara.</T></p>
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
              desc="Calon langsung diundang mengisi data. Setelah HRD memeriksa, Super Admin menyetujui di akhir." />
          </div>
        </section>

        {s.interview && (
          <>
            <section className="space-y-2">
              <p className="text-xs font-semibold text-gray-700">2. <T>Model approval wawancara</T></p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Choice active={s.mode === "TUNGGAL"} title="Tunggal" onClick={() => set({ mode: "TUNGGAL" as ApprovalMode, approvers: s.approvers.slice(0, 1) })}
                  desc="Cukup satu approver." />
                <Choice active={s.mode === "SIRKULAR"} title="Sirkular" onClick={() => set({ mode: "SIRKULAR" as ApprovalMode })}
                  desc="Beberapa approver, semuanya harus setuju. Satu saja menolak, calon ditolak." />
              </div>
              {s.mode === "SIRKULAR" && (
                <div className="flex flex-col gap-2 pt-1 sm:flex-row">
                  <Choice active={s.order === "BERURUTAN"} title="Berurutan (berjenjang)" onClick={() => set({ order: "BERURUTAN" as ApprovalOrder })}
                    desc="Approver berikutnya baru bisa memutus setelah approver sebelumnya setuju." />
                  <Choice active={s.order === "BERSAMAAN"} title="Bersamaan" onClick={() => set({ order: "BERSAMAAN" as ApprovalOrder })}
                    desc="Semua approver menerima sekaligus; lolos setelah semuanya setuju." />
                </div>
              )}
            </section>

            <section className="space-y-2">
              <p className="text-xs font-semibold text-gray-700">3. <T>{s.mode === "TUNGGAL" ? "Approver" : "Daftar approver"}</T></p>
              {s.approvers.length > 0 && (
                <ol className="divide-y divide-gray-100 rounded-xl border border-gray-200">
                  {s.approvers.map((a, i) => (
                    <li key={a.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                      {s.mode === "SIRKULAR" && <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-600">{i + 1}</span>}
                      <span className="min-w-0 flex-1"><span className="block truncate font-medium text-gray-800">{a.name}</span>
                        <span className="block truncate text-[11px] text-gray-400">{info(a.id)}</span></span>
                      {s.mode === "SIRKULAR" && s.order === "BERURUTAN" && (
                        <>
                          <button type="button" aria-label={t("Naik")} disabled={i === 0} onClick={() => move(i, -1)} className="rounded p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30"><ArrowUp size={14} /></button>
                          <button type="button" aria-label={t("Turun")} disabled={i === s.approvers.length - 1} onClick={() => move(i, 1)} className="rounded p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30"><ArrowDown size={14} /></button>
                        </>
                      )}
                      <button type="button" aria-label={t("Hapus")} onClick={() => set({ approvers: s.approvers.filter((x) => x.id !== a.id) })} className="rounded p-1 text-gray-400 hover:text-rose-600"><Trash2 size={14} /></button>
                    </li>
                  ))}
                </ol>
              )}
              {s.approvers.length < max && (
                <div className="flex gap-2">
                  <select value={pick} onChange={(e) => setPick(e.target.value)} className="h-9 min-w-0 flex-1 rounded-lg border border-input bg-white px-2 text-sm">
                    <option value="">{t("Pilih karyawan sebagai approver")}</option>
                    {users.filter((u) => !s.approvers.some((a) => a.id === u.id)).map((u) => <option key={u.id} value={u.id}>{u.name}{u.info ? ` · ${u.info}` : ""}</option>)}
                  </select>
                  <Button type="button" variant="outline" disabled={!pick} onClick={add}><T>Tambah</T></Button>
                </div>
              )}
              <p className="text-[11px] text-gray-400"><T>Approver memutus lewat menu Persetujuan → tab Wawancara.</T></p>
            </section>

            <div className="rounded-xl bg-gray-50 px-4 py-3 text-xs leading-relaxed text-gray-600">
              <p className="mb-1 font-semibold text-gray-700"><T>Alur dengan wawancara</T></p>
              <T>HRD daftarkan calon → isi hasil wawancara & tawaran kerja → approval → undangan isi data otomatis ke email calon → HRD periksa data → HRD isi Employee ID & penempatan → langsung masuk database sebagai karyawan.</T>
            </div>
          </>
        )}
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
