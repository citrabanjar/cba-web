"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Plus, Save, ShieldCheck, Trash2, UserPlus, Users, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { T, useT } from "@/components/i18n";
import { LEVEL_LABEL, MENUS, menuEntry, menuLevelOf, type MenuLevel } from "@/lib/roles";
import type { AdminRole } from "@/lib/admin-roles";
import { saveRoles } from "./role-actions";
import EmployeeCombobox from "@/components/portal/EmployeeCombobox";

export type Person = { id: string; employeeId: string | null; name: string; position: string | null };
const label = (p: Pick<Person, "employeeId" | "name">) => `${p.employeeId ?? "-"} - ${p.name}`;

// Simpan seluruh daftar peran; dipakai kedua tab.
function useSave(initial: AdminRole[]) {
  const router = useRouter();
  const [roles, setRoles] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(roles) !== JSON.stringify(initial);
  const save = () => start(async () => {
    const r = await saveRoles(roles);
    setMsg(r.error ? { ok: false, text: r.error } : { ok: true, text: "Tersimpan dan langsung berlaku." });
    if (!r.error) router.refresh();
  });
  const patch = (id: string, change: Partial<AdminRole>) => { setMsg(null); setRoles((prev) => prev.map((r) => (r.id === id ? { ...r, ...change } : r))); };
  return { roles, setRoles, msg, setMsg, pending, dirty, save, patch };
}

function SaveBar({ s }: { s: ReturnType<typeof useSave> }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button onClick={s.save} disabled={s.pending || !s.dirty} className="h-9 gap-1.5 rounded-full px-5">
        {s.pending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} <T>Simpan</T>
      </Button>
      {s.msg && (
        <span className={`flex items-center gap-1.5 text-sm ${s.msg.ok ? "text-emerald-700" : "text-red-600"}`}>
          {s.msg.ok && <CheckCircle2 size={15} />} <T>{s.msg.text}</T>
        </span>
      )}
    </div>
  );
}

// Tab 1 — Peran Admin: nama peran dan kewenangannya (menu yang boleh dibuka).
export function RolesSettings({ roles: initial }: { roles: AdminRole[] }) {
  const t = useT();
  const s = useSave(initial);
  const [name, setName] = useState("");

  function add() {
    const n = name.trim();
    if (!n) return;
    s.setMsg(null);
    s.setRoles((prev) => [...prev, { id: `peran-${Date.now().toString(36)}`, name: n, desc: "", menus: [], members: [], approvalLevels: 0 }]);
    setName("");
  }

  return (
    <Card className="border-gray-100">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gray-600">
          <ShieldCheck size={16} /> <T>Peran Admin</T>
        </CardTitle>
        <p className="text-xs text-gray-500">
          <T>Buat peran (mis. Admin Absen) dan pilih kewenangannya. Wewenang approve / reject pengajuan diatur di menu Workflow dengan memilih peran ini sebagai penyetuju.</T>
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }}
            placeholder={t("Nama peran, mis. Admin Absen")} className="h-9 max-w-xs flex-1" />
          <Button size="sm" variant="outline" onClick={add} disabled={!name.trim()} className="h-9 gap-1.5 rounded-full px-4">
            <Plus size={14} /> <T>Buat Peran</T>
          </Button>
        </div>

        {s.roles.length === 0 && <p className="rounded-xl bg-gray-50 py-6 text-center text-sm text-gray-400"><T>Belum ada peran.</T></p>}
        {s.roles.map((r) => (
          <div key={r.id} className="rounded-2xl border border-gray-200 p-4">
            <div className="flex flex-wrap items-start gap-2">
              <div className="min-w-0 flex-1 space-y-1.5">
                <Input value={r.name} onChange={(e) => s.patch(r.id, { name: e.target.value })} className="h-9 font-semibold" />
                <Input value={r.desc} onChange={(e) => s.patch(r.id, { desc: e.target.value })} placeholder={t("Keterangan (opsional)")} className="h-8 text-xs" />
                {/* Aturan approval untuk seluruh peran (bukan per kewenangan). */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="text-xs font-medium text-gray-500"><T>Approval perubahan data</T>:</span>
                  {([[0, "Tanpa approval"], [1, "Level 1: atasan langsung"], [2, "Level 2: atasan dari atasan langsung"]] as const).map(([lv, label]) => (
                    <button key={lv} type="button"
                      onClick={() => s.patch(r.id, {
                        approvalLevels: lv,
                        menus: r.menus.map((k) => (lv > 0 && k === "karyawan" ? menuEntry("karyawan", "propose") : lv === 0 && k === menuEntry("karyawan", "propose") ? "karyawan" : k)),
                      })}
                      className={`rounded-full border px-3 py-1 text-xs font-semibold ${r.approvalLevels === lv ? "border-brand bg-brand text-white" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"}`}>
                      <T>{label}</T>
                    </button>
                  ))}
                </div>
                {r.approvalLevels > 0 && (
                  <p className="text-[11px] text-gray-500"><T>Perubahan baru berlaku setelah disetujui satu approver sesuai level, dari bagan karyawan yang datanya diubah. Saat ini berlaku untuk Edit Data Karyawan.</T></p>
                )}
              </div>
              <Button size="sm" variant="outline" className="h-9 gap-1.5 rounded-full text-red-600 hover:text-red-700"
                onClick={() => {
                  const warn = r.members.length ? t("Peran ini punya anggota. Hapus peran? Anggota kehilangan kewenangan dari peran ini.") : t("Hapus peran ini?");
                  if (confirm(warn)) { s.setMsg(null); s.setRoles((prev) => prev.filter((x) => x.id !== r.id)); }
                }}>
                <Trash2 size={14} /> <T>Hapus</T>
              </Button>
            </div>
            <p className="mt-3 text-xs font-medium text-gray-500"><T>Kewenangan</T></p>
            <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
              {MENUS.map((m) => {
                // "Ajukan" tidak tampil sebagai pilihan sendiri: Edit dengan approval diatur di kotak Approval di bawah.
                const raw = menuLevelOf(r.menus, m.key);
                const level = raw === "propose" ? "edit" : raw;
                const choices: { v: MenuLevel | null; label: string }[] = [
                  { v: null, label: "Tidak" },
                  ...(m.levels as readonly MenuLevel[]).filter((l) => l !== "propose").map((l) => ({ v: l, label: LEVEL_LABEL[l] })),
                ];
                const entry = (v: MenuLevel) => (m.key === "karyawan" && v === "edit" && r.approvalLevels > 0 ? menuEntry(m.key, "propose") : menuEntry(m.key, v));
                const pick = (v: MenuLevel | null) => s.patch(r.id, {
                  menus: [...r.menus.filter((k) => k !== m.key && k !== menuEntry(m.key, "view") && k !== menuEntry(m.key, "propose")), ...(v ? [entry(v)] : [])],
                });
                return (
                  <div key={m.key} title={t(m.desc)} className="flex items-center justify-between gap-2 rounded-xl border border-gray-100 bg-gray-50/60 px-3 py-1.5">
                    <span className={`truncate text-xs font-medium ${level ? "text-gray-900" : "text-gray-400"}`}><T>{m.label}</T></span>
                    <span className="flex shrink-0 rounded-full border border-gray-200 bg-white p-0.5">
                      {choices.map((c) => (
                        <button key={c.label} type="button" onClick={() => pick(c.v)}
                          className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition ${level === c.v
                            ? c.v === "edit" ? "bg-brand text-white" : c.v === "view" ? "bg-sky-600 text-white" : "bg-gray-200 text-gray-700"
                            : "text-gray-400 hover:text-gray-700"}`}>
                          <T>{c.label}</T>
                        </button>
                      ))}
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-gray-400">{r.members.length} <T>anggota</T></p>
          </div>
        ))}
        <SaveBar s={s} />
      </CardContent>
    </Card>
  );
}

// Tab 2 — Anggota Admin: siapa saja yang masuk tiap peran (tambah dengan Employee ID).
export function MembersSettings({ roles: initial, people }: { roles: AdminRole[]; people: Person[] }) {
  const s = useSave(initial);
  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const options = useMemo(() => people.filter((p) => p.employeeId).map((p) => ({ value: p.employeeId!, label: p.name })), [people]);
  const [text, setText] = useState<Record<string, string>>({});
  const [err, setErr] = useState<Record<string, string>>({});

  function add(roleId: string) {
    const q = (text[roleId] ?? "").trim().toUpperCase();
    const p = people.find((x) => label(x).toUpperCase() === q || (x.employeeId ?? "").toUpperCase() === q);
    if (!p) { setErr((e) => ({ ...e, [roleId]: "Employee ID tidak ditemukan di karyawan aktif." })); return; }
    const role = s.roles.find((r) => r.id === roleId)!;
    if (!role.members.includes(p.id)) s.patch(roleId, { members: [...role.members, p.id] });
    setText((x) => ({ ...x, [roleId]: "" }));
    setErr((e) => ({ ...e, [roleId]: "" }));
  }

  return (
    <Card className="border-gray-100">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gray-600">
          <Users size={16} /> <T>Anggota Admin</T>
        </CardTitle>
        <p className="text-xs text-gray-500">
          <T>Tambahkan karyawan ke peran dengan Employee ID. Anggota otomatis menjadi Admin; karyawan yang tidak ikut peran mana pun kembali menjadi karyawan biasa.</T>
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {s.roles.length === 0 && <p className="rounded-xl bg-gray-50 py-6 text-center text-sm text-gray-400"><T>Buat peran dulu di tab Peran Admin.</T></p>}
        {s.roles.map((r) => (
          <div key={r.id} className="rounded-2xl border border-gray-200 p-4">
            <p className="font-semibold text-gray-900">{r.name}</p>
            <p className="text-xs text-gray-500">
              {r.menus.length ? MENUS.flatMap((m) => { const l = menuLevelOf(r.menus, m.key); return l ? [`${m.label} (${l === "propose" ? `Edit, approval Level ${r.approvalLevels}` : LEVEL_LABEL[l]})`] : []; }).join(" · ") : <T>Belum ada kewenangan.</T>}
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {r.members.length === 0 && <span className="text-xs text-gray-400"><T>Belum ada anggota.</T></span>}
              {r.members.map((id) => {
                const p = byId.get(id);
                return (
                  <span key={id} className="inline-flex items-center gap-1 rounded-full bg-gray-100 py-1 pl-3 pr-1.5 text-xs text-gray-700">
                    {p ? label(p) : <T>(karyawan tidak aktif)</T>}
                    <button type="button" aria-label="Hapus" onClick={() => s.patch(r.id, { members: r.members.filter((m) => m !== id) })}
                      className="rounded-full p-0.5 text-gray-400 hover:bg-gray-200 hover:text-red-600"><X size={12} /></button>
                  </span>
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap items-start gap-2">
              {/* Daftar karyawan selalu membuka ke bawah isian (bukan datalist bawaan browser). */}
              <div className="max-w-xs flex-1">
                <EmployeeCombobox id={`anggota-${r.id}`} value={text[r.id] ?? ""} options={options}
                  onChange={(v) => { setText((x) => ({ ...x, [r.id]: v })); setErr((x) => ({ ...x, [r.id]: "" })); }} />
              </div>
              <Button size="sm" variant="outline" onClick={() => add(r.id)} disabled={!(text[r.id] ?? "").trim()} className="h-9 gap-1.5 rounded-full px-4">
                <UserPlus size={14} /> <T>Tambah</T>
              </Button>
            </div>
            {err[r.id] && <p className="mt-1 text-sm text-red-600"><T>{err[r.id]}</T></p>}
          </div>
        ))}
        <SaveBar s={s} />
      </CardContent>
    </Card>
  );
}
