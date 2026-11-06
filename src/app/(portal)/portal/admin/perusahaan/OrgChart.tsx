"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, TriangleAlert } from "lucide-react";

type Person = {
  id: string;
  name: string;
  position: string | null;
  image: string | null;
  managerId: string | null;
  department: string | null;
};

type Tree = Person & { reports: Tree[]; total: number };

function buildTree(people: Person[]) {
  const ids = new Set(people.map((p) => p.id));
  const byManager = new Map<string, Person[]>();
  for (const person of people) {
    if (person.managerId && ids.has(person.managerId)) {
      byManager.set(person.managerId, [...(byManager.get(person.managerId) ?? []), person]);
    }
  }

  const placed = new Set<string>();
  const grow = (person: Person): Tree => {
    placed.add(person.id);
    const reports = (byManager.get(person.id) ?? []).map(grow);
    return { ...person, reports, total: reports.reduce((sum, r) => sum + 1 + r.total, 0) };
  };

  // Atasan yang sudah nonaktif dianggap kosong, supaya bawahannya tetap tampil.
  const tops = people.filter((p) => !p.managerId || !ids.has(p.managerId)).map(grow);
  const roots = tops.filter((t) => t.reports.length > 0);
  const unassigned = tops.filter((t) => t.reports.length === 0);
  // Yang tidak terjangkau dari puncak berarti rantai atasannya berputar.
  const looped = people.filter((p) => !placed.has(p.id));
  return { roots, unassigned, looped };
}

function PersonCard({
  person, canOpenProfile, children,
}: {
  person: Pick<Person, "id" | "name" | "position" | "image" | "department">;
  canOpenProfile: boolean;
  children?: React.ReactNode;
}) {
  const initials = person.name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const body = (
    <div className="flex items-center gap-2.5 text-left">
      {person.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={person.image} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
      ) : (
        <div className="w-9 h-9 rounded-full bg-ink text-white text-xs font-bold flex items-center justify-center shrink-0">
          {initials}
        </div>
      )}
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-800 truncate">{person.name}</p>
        <p className="text-xs text-gray-500 truncate">{person.position ?? "Jabatan belum diisi"}</p>
        {person.department && <p className="text-[11px] text-gray-400 truncate">{person.department}</p>}
      </div>
    </div>
  );
  return (
    <div className="w-56 bg-white border border-gray-200 border-l-4 border-l-brand rounded-lg px-3 py-2.5 shadow-sm">
      {canOpenProfile ? (
        <Link href={`/portal/admin/karyawan/${person.id}`} className="block hover:opacity-80">{body}</Link>
      ) : body}
      {children}
    </div>
  );
}

function Branch({
  node, closed, toggle, canOpenProfile,
}: {
  node: Tree; closed: Set<string>; toggle: (id: string) => void; canOpenProfile: boolean;
}) {
  const open = !closed.has(node.id);
  return (
    <li>
      <div className="org-node">
        <PersonCard person={node} canOpenProfile={canOpenProfile}>
          {node.reports.length > 0 && (
            <button
              onClick={() => toggle(node.id)}
              aria-expanded={open}
              className="mt-2 flex w-full items-center justify-center gap-1 text-xs text-gray-500 hover:text-brand"
            >
              {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              {node.total} anak buah
            </button>
          )}
        </PersonCard>
      </div>
      {open && node.reports.length > 0 && (
        <ul>
          {node.reports.map((r) => (
            <Branch key={r.id} node={r} closed={closed} toggle={toggle} canOpenProfile={canOpenProfile} />
          ))}
        </ul>
      )}
    </li>
  );
}

export default function OrgChart({
  people, canOpenProfile,
}: {
  people: Person[]; canOpenProfile: boolean;
}) {
  const { roots, unassigned, looped } = useMemo(() => buildTree(people), [people]);
  const [closed, setClosed] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setClosed((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return (
    <div className="bg-gray-50 min-h-full">
      <div className="bg-white border-b border-gray-100 px-6 py-4">
        <h2 className="font-bold text-gray-800">Struktur Organisasi</h2>
        <p className="text-xs text-gray-400 mt-0.5">
          {people.length} karyawan aktif. Dibuat otomatis dari kolom Atasan Langsung.
        </p>
      </div>

      <main className="px-4 sm:px-6 py-5 space-y-5">
        {looped.length > 0 && (
          <div className="flex items-start gap-3 bg-red-50 text-red-700 rounded-xl p-4 text-sm">
            <TriangleAlert size={18} className="shrink-0 mt-0.5" />
            <p>
              Atasan karyawan berikut saling menunjuk, jadi belum bisa ditampilkan:{" "}
              {looped.map((p) => p.name).join(", ")}.
            </p>
          </div>
        )}

        {roots.length > 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-5 overflow-x-auto">
            <ul className="org-tree">
              {roots.map((node) => (
                <Branch key={node.id} node={node} closed={closed} toggle={toggle} canOpenProfile={canOpenProfile} />
              ))}
            </ul>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 py-12 text-center text-sm text-gray-400">
            Struktur akan muncul setelah kolom Atasan Langsung terisi.
          </div>
        )}

        {unassigned.length > 0 && (
          <section className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-sm text-gray-800">
              Belum punya atasan ({unassigned.length})
            </h3>
            <p className="text-xs text-gray-500 mt-0.5 mb-4">
              Isi Atasan Langsung di profil karyawan supaya masuk ke struktur.
            </p>
            <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(14rem,1fr))]">
              {unassigned.map((p) => (
                <PersonCard key={p.id} person={p} canOpenProfile={canOpenProfile} />
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
