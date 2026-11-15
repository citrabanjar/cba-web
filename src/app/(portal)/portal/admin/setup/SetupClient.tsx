"use client";

import { useState, useTransition } from "react";
import { Briefcase, Building2, Check, ChevronRight, Network, Pencil, Plus, Trash2, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { T, useT } from "@/components/i18n";
import { deleteMasterItem, saveMasterItem, type MasterKind } from "./actions";

type Item = { id: string; name: string; used: number };

const ICON: Record<MasterKind, React.ElementType> = { branch: Building2, department: Network, position: Briefcase };

function MasterCard({ kind, title, items }: { kind: MasterKind; title: string; items: Item[] }) {
  const Icon = ICON[kind];
  const t = useT();
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<Item | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function run(action: () => Promise<{ error?: string }>, done: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) setError(result.error);
      else done();
    });
  }

  const add = () => run(() => saveMasterItem(kind, null, newName), () => setNewName(""));
  const rename = () => {
    if (editing) run(() => saveMasterItem(kind, editing.id, editing.name), () => setEditing(null));
  };

  return (
    <section className="min-w-0 bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="section-head flex items-center justify-between gap-3 px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="section-icon"><Icon size={17} /></span>
          <h3 className="font-semibold text-[15px]"><T>{title}</T></h3>
        </div>
        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">{items.length}</span>
      </div>

      <div className="p-5 space-y-3">
        <div className="flex gap-2">
          <Input
            value={newName}
            aria-label={t(title)}
            placeholder={t("Tambah baru")}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") add(); }}
            className="h-10 rounded-full bg-gray-50 px-4"
          />
          <Button onClick={add} disabled={isPending || !newName.trim()} className="h-10 gap-1.5 rounded-full px-5">
            <Plus size={15} /> <T>Tambah</T>
          </Button>
        </div>

        {error && <p className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2"><T>{error}</T></p>}

        {items.length === 0 ? (
          <p className="py-4 text-center text-sm text-gray-400"><T>Belum ada data.</T></p>
        ) : (
          <ul className="max-h-[calc(100vh-22rem)] min-h-40 overflow-y-auto pr-1 space-y-2">
            {items.map((item) => (
              <li key={item.id} className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50/70 px-3 py-2.5">
                {editing?.id === item.id ? (
                  <>
                    <Input
                      autoFocus
                      value={editing.name}
                      aria-label={t("Ubah nama")}
                      onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                      onKeyDown={(e) => { if (e.key === "Enter") rename(); }}
                    />
                    <button type="button" onClick={rename} disabled={isPending} aria-label={t("Simpan")} className="p-1 text-green-700">
                      <Check size={16} />
                    </button>
                    <button type="button" onClick={() => setEditing(null)} aria-label={t("Batal")} className="p-1 text-gray-400">
                      <X size={16} />
                    </button>
                  </>
                ) : (
                  <>
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-xs font-bold text-gray-600 shadow-sm ring-1 ring-gray-200">
                      {item.name.trim()[0]?.toUpperCase()}
                    </span>
                    <p className="min-w-0 flex-1 text-sm font-semibold text-gray-900 break-words">{item.name}</p>
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white px-2.5 py-0.5 text-xs font-medium text-gray-500 ring-1 ring-gray-200">
                      <Users size={12} /> {item.used}
                    </span>
                    <button type="button" onClick={() => { setEditing(item); setError(null); }} aria-label={t("Ubah nama")} className="rounded-full p-1.5 text-gray-400 hover:bg-white hover:text-brand">
                      <Pencil size={15} />
                    </button>
                    <button
                      type="button"
                      disabled={isPending || item.used > 0}
                      title={item.used > 0 ? t("Masih dipakai karyawan, jadi belum bisa dihapus.") : undefined}
                      onClick={() => run(() => deleteMasterItem(kind, item.id), () => {})}
                      aria-label={t("Hapus")}
                      className="rounded-full p-1.5 text-gray-400 hover:bg-white hover:text-brand disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-400"
                    >
                      <Trash2 size={15} />
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

// Seperti halaman Notifikasi: Cabang / Departemen / Jabatan bersusun di kiri, isi yang dipilih di kanan.
const KINDS: { kind: MasterKind; title: string }[] = [
  { kind: "branch", title: "Cabang" }, { kind: "department", title: "Departemen" }, { kind: "position", title: "Jabatan" },
];

export default function SetupClient({
  branches, departments, positions,
}: {
  branches: Item[]; departments: Item[]; positions: Item[];
}) {
  const [sel, setSel] = useState<MasterKind>("branch");
  const lists: Record<MasterKind, Item[]> = { branch: branches, department: departments, position: positions };
  const current = KINDS.find((k) => k.kind === sel)!;
  return (
    <div className="bg-gray-50 min-h-full">
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="font-bold text-gray-800"><T>Organisasi</T></h2>
          <p className="text-xs text-gray-400 mt-0.5">
            <T>Master struktur perusahaan: daftar cabang, departemen, dan jabatan yang menjadi acuan seluruh data karyawan.</T>
          </p>
        </div>
      </div>
      <main className="px-4 sm:px-6 py-5 max-w-6xl">
        <div className="grid gap-4 md:grid-cols-[15rem_1fr]">
          <nav className="h-fit overflow-hidden rounded-2xl border border-gray-200 bg-white">
            {KINDS.map((k) => {
              const Icon = ICON[k.kind];
              const on = k.kind === sel;
              return (
                <button key={k.kind} type="button" onClick={() => setSel(k.kind)}
                  className={`flex w-full items-center gap-3 border-b border-gray-100 px-4 py-3 text-left last:border-b-0 ${on ? "bg-brand/10" : "hover:bg-gray-50"}`}>
                  <Icon size={18} className={on ? "text-brand" : "text-gray-400"} />
                  <span className={`flex-1 text-sm ${on ? "font-semibold text-brand" : "text-gray-700"}`}><T>{k.title}</T></span>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-600">{lists[k.kind].length}</span>
                  <ChevronRight size={14} className={on ? "text-brand" : "text-gray-300"} />
                </button>
              );
            })}
          </nav>
          <MasterCard key={sel} kind={sel} title={current.title} items={lists[sel]} />
        </div>
      </main>
    </div>
  );
}
