"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save, ShieldCheck, UserMinus, UserPlus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { T, useT } from "@/components/i18n";
import { MENUS } from "@/lib/roles";
import { setEmployeeAccess } from "../karyawan/actions";

type Person = { id: string; employeeId: string | null; name: string; position: string | null; menuAccess: string[] };
const label = (p: Pick<Person, "employeeId" | "name">) => `${p.employeeId ?? "-"} - ${p.name}`;

// Satu baris Admin: menu yang boleh dibuka dipilih dengan tombol, lalu disimpan.
function AdminRow({ admin }: { admin: Person }) {
  const router = useRouter();
  const t = useT();
  const [menus, setMenus] = useState<string[]>(admin.menuAccess);
  const [pending, start] = useTransition();
  const changed = [...menus].sort().join() !== [...admin.menuAccess].sort().join();

  const run = (role: "ADMIN" | "KARYAWAN", list: string[]) =>
    start(async () => { await setEmployeeAccess(admin.id, role, list); router.refresh(); });

  return (
    <div className="rounded-2xl border border-gray-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-gray-900">{label(admin)}</p>
          <p className="text-xs text-gray-500">{admin.position ?? "-"}</p>
        </div>
        <div className="flex gap-2">
          {changed && (
            <Button size="sm" disabled={pending} onClick={() => run("ADMIN", menus)} className="h-8 gap-1.5 rounded-full">
              {pending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} <T>Simpan</T>
            </Button>
          )}
          <Button size="sm" variant="outline" disabled={pending}
            onClick={() => { if (confirm(t("Cabut status Admin karyawan ini? Ia kembali menjadi karyawan biasa."))) run("KARYAWAN", []); }}
            className="h-8 gap-1.5 rounded-full text-red-600 hover:text-red-700">
            <UserMinus size={14} /> <T>Cabut</T>
          </Button>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {MENUS.map((m) => {
          const on = menus.includes(m.key);
          return (
            <button key={m.key} type="button" title={t(m.desc)}
              onClick={() => setMenus((prev) => (on ? prev.filter((k) => k !== m.key) : [...prev, m.key]))}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${on ? "border-brand bg-brand text-white" : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50"}`}>
              <T>{m.label}</T>
            </button>
          );
        })}
      </div>
      {menus.length === 0 && <p className="mt-2 text-xs text-amber-700"><T>Belum ada menu admin yang dibuka.</T></p>}
    </div>
  );
}

export default function AccessSettings({ admins, employees }: { admins: Person[]; employees: Person[] }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Cocokkan isian ke karyawan: boleh Employee ID saja atau pilihan "ID - Nama".
  const target = useMemo(() => {
    const q = text.trim().toUpperCase();
    if (!q) return null;
    return employees.find((e) => label(e).toUpperCase() === q || (e.employeeId ?? "").toUpperCase() === q) ?? null;
  }, [text, employees]);

  function add() {
    if (!target) { setError("Employee ID tidak ditemukan di karyawan aktif."); return; }
    setError(null);
    start(async () => { await setEmployeeAccess(target.id, "ADMIN", []); setText(""); router.refresh(); });
  }

  return (
    <Card className="border-gray-100">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gray-600">
          <ShieldCheck size={16} /> <T>Hak Akses Admin</T>
        </CardTitle>
        <p className="text-xs text-gray-500">
          <T>Tambahkan karyawan sebagai Admin dengan Employee ID, lalu pilih menu yang boleh dibuka. Perubahan langsung berlaku.</T>
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Input list="akses-karyawan" value={text} onChange={(e) => { setText(e.target.value); setError(null); }}
            onKeyDown={(e) => { if (e.key === "Enter") add(); }}
            placeholder="Employee ID" className="h-9 max-w-xs flex-1" />
          <datalist id="akses-karyawan">
            {employees.map((e) => <option key={e.id} value={label(e)} />)}
          </datalist>
          <Button size="sm" onClick={add} disabled={pending || !text.trim()} className="h-9 gap-1.5 rounded-full px-4">
            {pending ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />} <T>Tambah Admin</T>
          </Button>
        </div>
        {error && <p className="text-sm text-red-600"><T>{error}</T></p>}

        {admins.length === 0 ? (
          <p className="rounded-xl bg-gray-50 py-6 text-center text-sm text-gray-400"><T>Belum ada Admin.</T></p>
        ) : (
          <div className="space-y-3">
            {admins.map((a) => <AdminRow key={a.id + a.menuAccess.join()} admin={a} />)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
