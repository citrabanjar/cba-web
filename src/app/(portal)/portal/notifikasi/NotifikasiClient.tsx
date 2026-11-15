"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, Briefcase, ChevronLeft, CalendarCheck, CalendarDays, CheckCheck, ChevronRight, ClipboardCheck, HandCoins, Timer, UserRound, type LucideIcon } from "lucide-react";
import { T, useT } from "@/components/i18n";
import { formatDateTime } from "@/lib/utils";
import type { NotifModule } from "@/lib/notif-modules";
import { markNotificationsRead } from "@/app/(portal)/notif-actions";

type Item = { id: string; title: string; body: string | null; href: string | null; read: boolean; at: string; module: NotifModule };
type Mod = { key: NotifModule; label: string; total: number; unread: number };

const PER_PAGE = 30;

// Nomor halaman yang ditampilkan: semua bila sedikit, selain itu awal, akhir, dan sekitar halaman aktif.
function pageNumbers(page: number, pages: number): (number | "…")[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const set = [...new Set([1, pages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pages))].sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  set.forEach((p, i) => { if (i && p - set[i - 1] > 1) out.push("…"); out.push(p); });
  return out;
}

const ICONS: Record<NotifModule, LucideIcon> = {
  kehadiran: CalendarCheck, lembur: Timer, cuti: CalendarDays, dinas: Briefcase, pinjaman: HandCoins, profil: UserRound, lainnya: Bell,
};

export default function NotifikasiClient({ modules, items, selected, approvals }: { modules: Mod[]; items: Item[]; selected: NotifModule; approvals: number | null }) {
  const t = useT();
  const router = useRouter();
  const [mod, setMod] = useState<NotifModule>(selected);
  const [page, setPage] = useState(1);
  const [, start] = useTransition();
  const scroller = useRef<HTMLDivElement>(null);
  const list = items.filter((i) => i.module === mod);
  const pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
  const cur = Math.min(page, pages);
  const shown = list.slice((cur - 1) * PER_PAGE, cur * PER_PAGE);
  const goPage = (p: number) => { setPage(p); scroller.current?.scrollTo({ top: 0 }); };
  const current = modules.find((m) => m.key === mod);
  const unreadIds = list.filter((i) => !i.read).map((i) => i.id);

  const choose = (k: NotifModule) => {
    setMod(k);
    setPage(1);
    window.history.replaceState(null, "", `/portal/notifikasi?modul=${k}`);
  };
  const open = (n: Item) => start(async () => {
    if (!n.read) await markNotificationsRead(n.id);
    if (n.href) router.push(n.href); else router.refresh();
  });

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold text-white"><T>Notifikasi</T></h1>
        <p className="text-sm text-white/70"><T>Riwayat kabar per modul.</T></p>
      </div>

      {approvals !== null && (
        <Link href="/portal/persetujuan" className={`flex items-center gap-3 rounded-2xl border px-4 py-3 ${approvals > 0 ? "border-amber-200 bg-amber-50" : "border-gray-200 bg-white"}`}>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-400 text-ink"><ClipboardCheck size={16} /></span>
          <span className="min-w-0 flex-1 text-sm font-semibold text-gray-900">
            {approvals > 0 ? <>{approvals} <T>pengajuan menunggu persetujuan Anda</T></> : <T>Tidak ada pengajuan yang menunggu</T>}
          </span>
          <span className="text-xs font-semibold text-brand"><T>Buka Persetujuan →</T></span>
        </Link>
      )}

      <div className="grid gap-4 md:grid-cols-[15rem_1fr]">
        {/* Modul bersusun ke bawah */}
        <nav className="h-fit overflow-hidden rounded-2xl border border-gray-200 bg-white">
          {modules.map((m) => {
            const Icon = ICONS[m.key];
            const on = m.key === mod;
            return (
              <button key={m.key} type="button" onClick={() => choose(m.key)}
                className={`flex w-full items-center gap-3 border-b border-gray-100 px-4 py-3 text-left last:border-b-0 ${on ? "bg-brand/10" : "hover:bg-gray-50"}`}>
                <Icon size={18} className={on ? "text-brand" : "text-gray-400"} />
                <span className={`flex-1 text-sm ${on ? "font-semibold text-brand" : "text-gray-700"}`}><T>{m.label}</T></span>
                {m.unread > 0 && <span className="min-w-5 rounded-full bg-brand px-1.5 text-center text-[10px] font-bold leading-5 text-white">{m.unread}</span>}
                <ChevronRight size={14} className={on ? "text-brand" : "text-gray-300"} />
              </button>
            );
          })}
        </nav>

        {/* Riwayat modul terpilih */}
        <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
          <div className="flex items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
            <p className="text-sm font-semibold text-gray-900"><T>{current?.label ?? ""}</T> <span className="font-normal text-gray-400">· {list.length} <T>notifikasi</T></span></p>
            {unreadIds.length > 0 && (
              <button type="button" onClick={() => start(async () => { await markNotificationsRead(unreadIds); router.refresh(); })}
                className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline">
                <CheckCheck size={13} /> <T>Tandai semua dibaca</T>
              </button>
            )}
          </div>
          {list.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-gray-400"><T>Belum ada notifikasi.</T></p>
          ) : (
            <>
            <div ref={scroller} className="divide-y divide-gray-50 md:max-h-[calc(100vh-18rem)] md:overflow-y-auto">
              {shown.map((n) => (
                <button key={n.id} type="button" onClick={() => open(n)} title={n.href ? t("Buka") : undefined}
                  className={`flex w-full gap-3 px-4 py-3 text-left hover:bg-gray-50 ${n.read ? "" : "bg-rose-50/40"}`}>
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read ? "bg-transparent" : "bg-brand"}`} />
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm ${n.read ? "text-gray-700" : "font-semibold text-gray-900"}`}>{n.title}</span>
                    {n.body && <span className="block text-xs text-gray-500">{n.body}</span>}
                    <span className="mt-0.5 block text-[11px] text-gray-400">{formatDateTime(n.at)}</span>
                  </span>
                  {n.href && <ChevronRight size={14} className="mt-1 shrink-0 text-gray-300" />}
                </button>
              ))}
            </div>
            {pages > 1 && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 px-4 py-3">
                <p className="text-xs text-gray-400">{(cur - 1) * PER_PAGE + 1}–{Math.min(cur * PER_PAGE, list.length)} <T>dari</T> {list.length}</p>
                <div className="flex items-center gap-1">
                  <button type="button" disabled={cur === 1} onClick={() => goPage(cur - 1)} aria-label={t("Sebelumnya")}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40"><ChevronLeft size={15} /></button>
                  {pageNumbers(cur, pages).map((p, i) => p === "…" ? (
                    <span key={`e${i}`} className="px-1 text-xs text-gray-400">…</span>
                  ) : (
                    <button key={p} type="button" onClick={() => goPage(p)}
                      className={`h-8 min-w-8 rounded-lg px-2 text-xs font-semibold ${p === cur ? "bg-brand text-white" : "border border-gray-200 text-gray-600 hover:bg-gray-50"}`}>{p}</button>
                  ))}
                  <button type="button" disabled={cur === pages} onClick={() => goPage(cur + 1)} aria-label={t("Berikutnya")}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40"><ChevronRight size={15} /></button>
                </div>
              </div>
            )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
