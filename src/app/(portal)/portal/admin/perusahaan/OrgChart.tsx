"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, Printer, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { T } from "@/components/i18n";
import { formatDate } from "@/lib/utils";

type Person = {
  id: string;
  name: string;
  position: string | null;
  image: string | null;
  managerId: string | null;
  department: string | null;
};

type Tree = Person & { reports: Tree[]; total: number };
type Paper = "A4" | "A3";

// Lebar dan tinggi area cetak dalam piksel CSS: kertas landscape dikurangi margin 10 mm.
const PRINT_AREA: Record<Paper, { width: number; height: number }> = {
  A4: { width: 1047, height: 680 },
  A3: { width: 1512, height: 1047 },
};

// Grup seperti "PRODUCTION DEPARTEMENT GROUP WELDER" ikut departemen induknya.
const parentDepartment = (name: string | null) => name?.split(/\s+GROUP\s+/i)[0].trim() ?? null;

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

  // Atasan di luar daftar dianggap kosong, supaya bawahannya tetap tampil.
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
        <p className="text-xs text-gray-500 truncate">{person.position ?? <T>{"Jabatan belum diisi"}</T>}</p>
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
  // Anak buah paling bawah disusun ke bawah dalam satu kolom supaya bagan tidak melebar.
  const leaves = node.reports.filter((r) => r.reports.length === 0);
  const stacked = leaves.length >= 2;
  const branches = stacked ? node.reports.filter((r) => r.reports.length > 0) : node.reports;
  return (
    <li>
      <div className="org-node">
        <PersonCard person={node} canOpenProfile={canOpenProfile}>
          {node.reports.length > 0 && (
            <button
              onClick={() => toggle(node.id)}
              aria-expanded={open}
              className="print:hidden mt-2 flex w-full items-center justify-center gap-1 text-xs text-gray-500 hover:text-brand"
            >
              {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              {node.total} <T>anak buah</T>
            </button>
          )}
        </PersonCard>
      </div>
      {open && node.reports.length > 0 && (
        <ul>
          {branches.map((r) => (
            <Branch key={r.id} node={r} closed={closed} toggle={toggle} canOpenProfile={canOpenProfile} />
          ))}
          {stacked && (
            <li>
              <div className="org-stack">
                {leaves.map((r) => (
                  <div key={r.id} className="org-leaf">
                    <PersonCard person={r} canOpenProfile={canOpenProfile} />
                  </div>
                ))}
              </div>
            </li>
          )}
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
  const [department, setDepartment] = useState("");
  const [paper, setPaper] = useState<Paper>("A4");
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [printing, setPrinting] = useState(false);
  const chartRef = useRef<HTMLUListElement>(null);

  const departments = useMemo(
    () => [...new Set(people.map((p) => parentDepartment(p.department)).filter(Boolean) as string[])].sort(),
    [people],
  );
  const shown = useMemo(
    () => (department ? people.filter((p) => parentDepartment(p.department) === department) : people),
    [people, department],
  );
  const { roots, unassigned, looped } = useMemo(() => buildTree(shown), [shown]);

  const toggle = (id: string) =>
    setClosed((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  function handlePrint() {
    setClosed(new Set()); // yang dilipat dibuka dulu supaya tercetak lengkap
    setPrinting(true);
  }

  // Bagan dikecilkan setelah semua cabang terbuka, supaya muat di satu halaman.
  useEffect(() => {
    if (!printing) return;
    const chart = chartRef.current;
    const style = document.createElement("style");
    style.textContent = `@page { size: ${paper} landscape; margin: 10mm; }`;
    document.head.appendChild(style);

    if (chart) {
      const area = PRINT_AREA[paper];
      const scale = Math.min(1, area.width / chart.scrollWidth, area.height / chart.scrollHeight);
      chart.style.setProperty("--org-print-zoom", String(scale));
    }

    const finish = () => {
      style.remove();
      chart?.style.removeProperty("--org-print-zoom");
      setPrinting(false);
    };
    window.addEventListener("afterprint", finish, { once: true });
    window.print();
    return () => window.removeEventListener("afterprint", finish);
  }, [printing, paper]);

  const printDate = formatDate(new Date(), "Asia/Jakarta");

  return (
    <div className="bg-gray-50 min-h-full print:bg-white">
      <div className="print:hidden bg-white border-b border-gray-100 px-6 py-4">
        <h2 className="font-bold text-gray-800"><T>Struktur Organisasi</T></h2>
        <p className="text-xs text-gray-400 mt-0.5">
          {shown.length} <T>karyawan aktif. Dibuat otomatis dari kolom Atasan Langsung.</T>
        </p>
      </div>

      <main className="px-4 sm:px-6 py-5 space-y-5 print:p-0">
        <div className="print:hidden flex flex-wrap items-end gap-3">
          <label className="text-xs text-gray-600 space-y-1">
            <span className="block"><T>Tampilkan</T></span>
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="h-8 max-w-72 rounded-lg border border-input bg-white px-2 text-sm"
            >
              <option value=""><T>Seluruh Perusahaan</T></option>
              {departments.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
          <label className="text-xs text-gray-600 space-y-1">
            <span className="block"><T>Kertas</T></span>
            <select
              value={paper}
              onChange={(e) => setPaper(e.target.value as Paper)}
              className="h-8 rounded-lg border border-input bg-white px-2 text-sm"
            >
              <option value="A4"><T>A4 Landscape</T></option>
              <option value="A3"><T>A3 Landscape</T></option>
            </select>
          </label>
          <Button size="sm" onClick={handlePrint} disabled={roots.length === 0} className="gap-1.5">
            <Printer size={15} /> <T>Cetak PDF</T>
          </Button>
        </div>

        <div className="hidden print:block text-center">
          <h1 className="text-lg font-bold text-gray-900"><T>Struktur Organisasi</T></h1>
          <p className="text-sm text-gray-700"><T>PT. Citra Banjar Abadi</T>{department ? ` — ${department}` : ""}</p>
          <p className="text-xs text-gray-500 mb-4">{printDate}</p>
        </div>

        {looped.length > 0 && (
          <div className="print:hidden flex items-start gap-3 bg-red-50 text-red-700 rounded-xl p-4 text-sm">
            <TriangleAlert size={18} className="shrink-0 mt-0.5" />
            <p>
              <T>Atasan karyawan berikut saling menunjuk, jadi belum bisa ditampilkan:</T>{" "}
              {looped.map((p) => p.name).join(", ")}.
            </p>
          </div>
        )}

        {roots.length > 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-5 overflow-x-auto print:overflow-visible print:border-0 print:p-0">
            <ul ref={chartRef} className="org-tree">
              {roots.map((node) => (
                <Branch key={node.id} node={node} closed={closed} toggle={toggle} canOpenProfile={canOpenProfile} />
              ))}
            </ul>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 py-12 text-center text-sm text-gray-400">
            <T>Struktur akan muncul setelah kolom Atasan Langsung terisi.</T>
          </div>
        )}

        {unassigned.length > 0 && (
          <section className="print:hidden bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-sm text-gray-800">
              <T>Belum punya atasan (</T>{unassigned.length})
            </h3>
            <p className="text-xs text-gray-500 mt-0.5 mb-4">
              <T>Isi Atasan Langsung di profil karyawan supaya masuk ke struktur.</T>
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
