"use client";

import Link from "next/link";
import {
  AlarmClock, Building2, Cake, CalendarOff, CalendarRange, FileClock, FileWarning, HandCoins, Plane, UserCheck, UserX, Users,
} from "lucide-react";
import { T } from "@/components/i18n";
import type { Indicator, IndicatorIcon, Tone } from "./insights";

const ICONS: Record<IndicatorIcon, React.ElementType> = {
  schedule: CalendarRange, users: Users, building: Building2, present: UserCheck, absent: UserX,
  contract: FileWarning, leave: FileClock, trip: Plane, loan: HandCoins, birthday: Cake, holiday: CalendarOff, late: AlarmClock,
};
const TONES: Record<Tone, { icon: string; glow: string; bar: string }> = {
  blue: { icon: "bg-gradient-to-br from-brand to-rose-400 text-white shadow-md shadow-brand/30", glow: "from-rose-100", bar: "from-brand to-rose-400" },
  emerald: { icon: "bg-gradient-to-br from-emerald-500 to-teal-400 text-white shadow-md shadow-emerald-500/30", glow: "from-emerald-100", bar: "from-emerald-500 to-teal-400" },
  amber: { icon: "bg-gradient-to-br from-amber-500 to-orange-400 text-white shadow-md shadow-amber-500/30", glow: "from-amber-100", bar: "from-amber-500 to-orange-400" },
  violet: { icon: "bg-gradient-to-br from-ink to-slate-500 text-white shadow-md shadow-black/20", glow: "from-slate-100", bar: "from-ink to-slate-500" },
  rose: { icon: "bg-gradient-to-br from-rose-500 to-pink-400 text-white shadow-md shadow-rose-500/30", glow: "from-rose-100", bar: "from-rose-500 to-pink-400" },
};

function Card({ item }: { item: Indicator }) {
  const Icon = ICONS[item.icon];
  const tone = TONES[item.tone];
  const body = (
    <>
      <span aria-hidden className={`pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gradient-to-br to-transparent ${tone.glow}`} />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-gray-500"><T>{item.title}</T></p>
          <p className="mt-1 text-[28px] font-bold leading-tight tabular-nums text-gray-900">{item.value}</p>
        </div>
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${tone.icon}`}>
          <Icon size={20} />
        </span>
      </div>
      {item.steps ? (
        // Rincian per tahap (mis. Proses Pinjaman): angka kecil berderet.
        <div className={`relative mt-1.5 grid gap-1 ${item.steps.length === 2 ? "grid-cols-2" : item.steps.length === 3 ? "grid-cols-3" : "grid-cols-4"}`}>
          {item.steps.map((x) => {
            const inner = <>
              <span className="block text-sm font-bold tabular-nums text-gray-800">{x.value}</span>
              <span className="block truncate text-[10px] text-gray-400"><T>{x.label}</T></span>
            </>;
            // Kotak bertautan sendiri: di atas tautan kartu (z-10), membuka daftar yang sudah disaring.
            return x.href
              ? <Link key={x.label} href={x.href} className="relative z-10 rounded-lg bg-gray-50 px-1 py-0.5 text-center hover:bg-gray-100 hover:ring-1 hover:ring-gray-200">{inner}</Link>
              : <span key={x.label} className="rounded-lg bg-gray-50 px-1 py-0.5 text-center">{inner}</span>;
          })}
        </div>
      ) : (
        <p className="relative mt-1.5 truncate text-[11px] text-gray-400">
          {item.noteValue !== undefined && <span className="font-semibold text-gray-600">{item.noteValue} </span>}
          <T>{item.note}</T>
        </p>
      )}
      <span aria-hidden className={`absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r ${tone.bar}`} />
    </>
  );
  const cls = "relative block h-full overflow-hidden rounded-2xl border bg-white p-5";
  // Kartu dengan kotak bertautan: tautan kartu dipasang sebagai lapisan penuh di belakang (tautan tidak boleh bersarang).
  if (item.href && item.steps?.some((x) => x.href)) {
    return (
      <section className={`${cls} transition-transform hover:-translate-y-0.5`}>
        <Link href={item.href} aria-label={item.title} className="absolute inset-0" />
        {body}
      </section>
    );
  }
  return item.href
    ? <Link href={item.href} className={`${cls} transition-transform hover:-translate-y-0.5`}>{body}</Link>
    : <section className={cls}>{body}</section>;
}

// Kartu indikator Beranda: semua kartu berjalan terus ke kiri seperti running text (kartu
// jadwal di urutan pertama), dan berhenti saat disorot mouse (atau disentuh/difokus).
export default function IndicatorCards({ items }: { items: Indicator[] }) {
  const pool = [...items.filter((i) => i.pinned), ...items.filter((i) => !i.pinned)];
  if (!pool.length) return null;
  const running = pool.length > 4;
  // Daftar digandakan supaya putarannya menyambung tanpa jeda.
  const loop = running ? [...pool, ...pool] : pool;

  return (
    <div className="indicator-track @container overflow-hidden rounded-2xl">
      <div className={running ? "indicator-marquee" : "flex"} style={{ ["--marquee-duration" as string]: `${pool.length * 6}s` }}>
        {loop.map((item, idx) => (
          <div key={`${item.key}-${idx}`} aria-hidden={idx >= pool.length || undefined}
            className="w-[calc((100cqw+1.25rem)/1.2)] shrink-0 pr-5 sm:w-[calc((100cqw+1.25rem)/2)] xl:w-[calc((100cqw+1.25rem)/4)]">
            <Card item={item} />
          </div>
        ))}
      </div>
    </div>
  );
}
