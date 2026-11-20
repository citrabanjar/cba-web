"use client";

import { useState, useTransition } from "react";
import { ArrowLeftRight, Briefcase, CalendarDays, ChevronRight, GitBranch, HandCoins, Loader2, Plus, Save, Timer, Trash2, UserPen, type LucideIcon, ClockAlert, Stethoscope } from "lucide-react";
import { showNotice } from "@/components/portal/Confirm";
import { Button } from "@/components/ui/button";
import { T, useT } from "@/components/i18n";
import {
  INFO_MODULES, LEVEL_TYPES, levelTitle, MANAGER_OPTIONS, MAX_LEVELS, ROLE_GROUP_PREFIX, ROLE_OPTIONS, WORKFLOW_MODULES,
  type LevelType, type WorkflowKey, type WorkflowLevel, type WorkflowSettings,
} from "@/lib/workflow";
import { saveWorkflow } from "./actions";
import { useCanEdit } from "@/components/portal/edit-access";

type UserOption = { id: string; name: string; employeeId: string };
const select = "h-9 w-full rounded-lg border border-input bg-white px-2 text-sm";
const ICONS: Record<WorkflowKey, LucideIcon> = { CUTI: CalendarDays, DINAS: Briefcase, LEMBUR: Timer, LUPA_ABSEN: ClockAlert, REIMBURSE: Stethoscope, PINJAMAN: HandCoins, TUKAR_SHIFT: ArrowLeftRight, PERUBAHAN_DATA: UserPen };

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
  // Hak akses = Peran Admin buatan Super Admin (Pengaturan → Peran Admin). Pilihan lama (Super Admin, Semua Admin,
  // Admin per menu) tidak ditawarkan lagi; bila level tersimpan masih memakainya, tetap ditampilkan agar tidak hilang.
  const valueOptions = (type: LevelType, current = "") =>
    type === "MANAGER" ? MANAGER_OPTIONS.map((o) => ({ value: o.value, label: t(o.label) }))
    : type === "ROLE" ? [
      ...groups.map((g) => ({ value: `${ROLE_GROUP_PREFIX}${g.id}`, label: g.name })),
      ...ROLE_OPTIONS.filter((r) => r.value === current).map((r) => ({ value: r.value, label: t(r.label) })),
    ]
      : users.map((u) => ({ value: u.id, label: u.employeeId ? `${u.employeeId} - ${u.name}` : u.name }));
  // Level baru default: atasan langsung di bagan organisasi.
  const newLevel = (): WorkflowLevel => ({ type: "MANAGER", value: "1", label: "" });
  // Level jabatan ke-n (dihitung hanya di antara level jabatan) → "Atasan langsung", "Atasan dari atasan", …

  return (
    <div className="min-h-full bg-gray-50">
      <div className="border-b border-gray-100 bg-white px-6 py-4">
        <h2 className="flex items-center gap-2 font-bold text-gray-800"><GitBranch size={18} /> <T>Workflow</T></h2>
        <p className="mt-0.5 text-xs text-gray-400"><T>Mengatur penyetuju pengajuan untuk setiap modul. Modul yang aktif menggantikan persetujuan atasan langsung.</T></p>
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
                    <span className="block font-medium text-gray-800"><T>Gunakan workflow untuk modul ini</T></span>
                    <span className="block text-xs text-gray-400"><T>{m.key === "PERUBAHAN_DATA" ? "Jika tidak aktif, pengajuan diputus Admin Data Karyawan." : "Jika tidak aktif, pengajuan diputus atasan langsung."}</T></span>
                  </span>
                </label>

                {mod.enabled && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-gray-600"><T>Level persetujuan</T></p>
                    {mod.levels.map((l, i) => (
                      <div key={i} className="grid items-center gap-2 rounded-xl bg-gray-50 p-2 sm:grid-cols-[56px_minmax(0,1fr)_minmax(0,1.3fr)_28px]">
                        <span className="text-xs font-semibold text-gray-600"><T>Level</T> {i + 1}</span>
                        <select value={l.type} onChange={(e) => setLevel(m.key, i, { type: e.target.value as LevelType, value: e.target.value === "MANAGER" ? "1" : "", label: "" })} disabled={!canEdit} className={select}>
                          {LEVEL_TYPES.map((x) => <option key={x.value} value={x.value}>{t(x.label)}</option>)}
                        </select>
                        <select value={l.value} onChange={(e) => setLevel(m.key, i, { value: e.target.value, label: users.find((u) => u.id === e.target.value)?.name ?? groups.find((g) => `${ROLE_GROUP_PREFIX}${g.id}` === e.target.value)?.name ?? "" })} disabled={!canEdit} className={select}>
                          {l.type !== "MANAGER" && <option value="">{t(l.type === "ROLE" ? (groups.length ? "Pilih peran" : "Belum ada Peran Admin") : "Pilih karyawan")}</option>}
                          {valueOptions(l.type, l.value).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                        {canEdit && (
                          <button type="button" aria-label={t("Hapus")} onClick={() => setMod(m.key, { levels: mod.levels.filter((_, j) => j !== i) })}
                            className="justify-self-end rounded p-1.5 text-gray-400 hover:text-rose-600"><Trash2 size={14} /></button>
                        )}
                        {/* Hanya info: tidak memutus, diberi notifikasi saat pengajuan disetujui. */}
                        {(INFO_MODULES as readonly string[]).includes(m.key) && (
                          <label className={`flex items-center gap-2 text-xs text-gray-600 sm:col-start-2 sm:col-end-4 ${canEdit ? "cursor-pointer" : ""}`}>
                            <input type="checkbox" checked={!!l.info} disabled={!canEdit} className="h-3.5 w-3.5 accent-[#BE353F]"
                              onChange={(e) => setLevel(m.key, i, { info: e.target.checked })} />
                            <T>Hanya info</T> <span className="text-gray-400">· <T>tidak memutus, diberi notifikasi saat pengajuan disetujui</T></span>
                          </label>
                        )}
                        {/* Pinjaman: satu level menjadi Pemeriksa dokumen (memeriksa dokumen fisik & menyusun angsuran). */}
                        {m.key === "PINJAMAN" && (
                          <label className={`flex items-center gap-2 text-xs text-gray-600 sm:col-start-2 sm:col-end-4 ${canEdit ? "cursor-pointer" : ""}`}>
                            <input type="radio" name={`check-${m.key}`} checked={!!l.check} disabled={!canEdit} className="h-3.5 w-3.5 accent-[#BE353F]"
                              onChange={() => setMod(m.key, { levels: mod.levels.map((x, j) => ({ ...x, check: j === i })) })} />
                            <T>Pemeriksa dokumen</T> <span className="text-gray-400">· <T>memeriksa dokumen fisik dan menyusun angsuran</T></span>
                          </label>
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
                          .map(({ l }) => `${l.type === "EMPLOYEE" ? l.label : t(levelTitle(l))}${l.check ? ` (${t("pemeriksa dokumen")})` : ""}${l.info ? ` (${t("info")})` : ""}`).join(" → ")}</b>
                      </p>
                    )}
                  </div>
                )}

                {/* Ketentuan singkat per modul. */}
                <div className="border-t border-gray-100 pt-3 text-[11px] leading-relaxed text-gray-500">
                  <p className="font-semibold text-gray-600"><T>Ketentuan</T></p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4">
                    {(m.key === "PERUBAHAN_DATA" ? [
                      "Level berdasarkan hak akses dapat diputus oleh semua anggota peran tersebut, tanpa melihat bagan organisasi.",
                      "Perubahan data diterapkan setelah level terakhir menyetujui.",
                      "Satu orang tidak memutus dua kali.",
                    ] : [
                      "Atasan di bagan: atasan langsung atau atasan dari atasan langsung pemohon menurut bagan organisasi.",
                      "Level berdasarkan hak akses diputus oleh anggota peran terdekat di atas pemohon pada bagan organisasi.",
                      ...((INFO_MODULES as readonly string[]).includes(m.key) ? ["Level Hanya info tidak memutus; orangnya diberi notifikasi setelah pengajuan disetujui."] : []),
                      "Jika pemohon termasuk anggota peran tersebut, level itu dilewati.",
                      "Satu orang tidak memutus dua kali.",
                      ...(m.key === "PINJAMAN" ? ["Pemeriksa dokumen dapat dikerjakan semua anggota perannya dan ditempatkan tepat sebelum level terakhir."] : []),
                    ]).map((x) => <li key={x}><T>{x}</T></li>)}
                  </ul>
                </div>

                {canEdit && (
                  <div className="flex justify-end">
                    <Button disabled={pending} className="gap-1.5" onClick={() => start(async () => {
                      const cleaned = Object.fromEntries(Object.entries(s).map(([k, x]) => [k, { ...x, levels: x.levels.filter((l) => l.value) }])) as WorkflowSettings;
                      const r = await saveWorkflow(cleaned);
                      // Dialog standar portal (Pemberitahuan / Gagal) dengan tombol OK.
                      if (r.error) showNotice(t(r.error), "error");
                      else showNotice(t("Workflow tersimpan. Berlaku untuk pengajuan baru."));
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
