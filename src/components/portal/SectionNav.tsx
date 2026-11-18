"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { T } from "@/components/i18n";

export type NavSection = { key: string; label: string; icon?: React.ElementType; note?: string; content: React.ReactNode };

// Pola standar portal (seperti Jenis Cuti, Komponen Payroll, Shift, Lokasi Absen): daftar bagian di kiri,
// rincian bagian terpilih di kanan — satu panel tampil, bukan kartu yang ditumpuk. Di HP daftar di atas.
export default function SectionNav({ sections, initial }: { sections: (NavSection | null | false | undefined)[]; initial?: string }) {
  const list = sections.filter((s): s is NavSection => !!s);
  const [sel, setSel] = useState(initial && list.some((s) => s.key === initial) ? initial : list[0]?.key);
  const cur = list.find((s) => s.key === sel) ?? list[0];
  if (!cur) return null;
  return (
    <div className="grid gap-4 md:grid-cols-[15rem_minmax(0,1fr)]">
      <nav className="h-fit overflow-hidden rounded-2xl border border-gray-200 bg-white">
        {list.map((s) => {
          const on = s.key === cur.key;
          const Icon = s.icon;
          return (
            <button key={s.key} type="button" onClick={() => setSel(s.key)}
              className={`flex w-full items-center gap-2.5 border-b border-gray-100 px-4 py-2.5 text-left last:border-b-0 ${on ? "bg-brand/10" : "hover:bg-gray-50"}`}>
              {Icon && (
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${on ? "bg-gradient-to-br from-brand to-rose-400 text-white" : "bg-gray-100 text-gray-500"}`}>
                  <Icon size={14} />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className={`block truncate text-sm ${on ? "font-semibold text-brand" : "text-gray-700"}`}><T>{s.label}</T></span>
                {s.note && <span className="block truncate text-[11px] text-gray-400">{s.note}</span>}
              </span>
              <ChevronRight size={14} className={on ? "text-brand" : "text-gray-300"} />
            </button>
          );
        })}
      </nav>
      <div className="min-w-0">{cur.content}</div>
    </div>
  );
}
