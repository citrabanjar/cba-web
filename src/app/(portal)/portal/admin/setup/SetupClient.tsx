"use client";

import { useState, useTransition } from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { T, useT } from "@/components/i18n";
import { deleteMasterItem, saveMasterItem, type MasterKind } from "./actions";

type Item = { id: string; name: string; used: number };

function MasterCard({ kind, title, items }: { kind: MasterKind; title: string; items: Item[] }) {
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
    <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="section-head flex items-center justify-between gap-3 px-5 py-3">
        <h3 className="font-semibold text-sm"><T>{title}</T></h3>
        <span className="text-xs text-gray-500">{items.length}</span>
      </div>

      <div className="p-4 space-y-3">
        <div className="flex gap-2">
          <Input
            value={newName}
            aria-label={t(title)}
            placeholder="Tambah baru"
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") add(); }}
          />
          <Button size="sm" onClick={add} disabled={isPending || !newName.trim()} aria-label={t("Tambah baru")}>
            <Plus size={15} />
          </Button>
        </div>

        {error && <p className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2"><T>{error}</T></p>}

        {items.length === 0 ? (
          <p className="py-4 text-center text-sm text-gray-400"><T>Belum ada data.</T></p>
        ) : (
          <ul className="max-h-72 overflow-y-auto pr-1 divide-y divide-gray-100">
            {items.map((item) => (
              <li key={item.id} className="flex items-center gap-2 py-2">
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
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-gray-800 break-words">{item.name}</p>
                      <p className="text-xs text-gray-400">{item.used} <T>karyawan</T></p>
                    </div>
                    <button type="button" onClick={() => { setEditing(item); setError(null); }} aria-label={t("Ubah nama")} className="p-1 text-gray-400 hover:text-brand">
                      <Pencil size={15} />
                    </button>
                    <button
                      type="button"
                      disabled={isPending || item.used > 0}
                      title={item.used > 0 ? t("Masih dipakai karyawan, jadi belum bisa dihapus.") : undefined}
                      onClick={() => run(() => deleteMasterItem(kind, item.id), () => {})}
                      aria-label={t("Hapus")}
                      className="p-1 text-gray-400 hover:text-brand disabled:opacity-30 disabled:hover:text-gray-400"
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

export default function SetupClient({
  branches, departments, positions,
}: {
  branches: Item[]; departments: Item[]; positions: Item[];
}) {
  return (
    <div className="bg-gray-50 min-h-full">
      <div className="bg-white border-b border-gray-100 px-6 py-4">
        <h2 className="font-bold text-gray-800"><T>Setup Organisasi</T></h2>
        <p className="text-xs text-gray-400 mt-0.5">
          <T>Cabang, Departemen, dan Jabatan di sini menjadi pilihan di data karyawan.</T>
        </p>
      </div>
      <main className="section-stack px-4 sm:px-6 py-5 space-y-5">
        <MasterCard kind="branch" title="Cabang" items={branches} />
        <MasterCard kind="department" title="Departemen" items={departments} />
        <MasterCard kind="position" title="Jabatan" items={positions} />
      </main>
    </div>
  );
}
