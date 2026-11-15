"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, Briefcase, CalendarCheck, CalendarDays, CheckCheck, ChevronRight, ClipboardCheck, HandCoins, Timer, UserRound, type LucideIcon } from "lucide-react";
import { T, useT } from "@/components/i18n";
import { formatDateTime } from "@/lib/utils";
import type { NotifModule } from "@/lib/notif-modules";
import { markNotificationsRead } from "@/app/(portal)/notif-actions";

type Item = { id: string; title: string; body: string | null; href: string | null; read: boolean; at: string; module: NotifModule };
type Mod = { key: NotifModule; label: string; total: number; unread: number };

const ICONS: Record<NotifModule, LucideIcon> = {
  kehadiran: CalendarCheck, lembur: Timer, cuti: CalendarDays, dinas: Briefcase, pinjaman: HandCoins, profil: UserRound, lainnya: Bell,
};

export default function NotifikasiClient({ modules, items, selected, approvals }: { modules: Mod[]; items: Item[]; selected: NotifModule; approvals: number | null }) {
  const t = useT();
  const router = useRouter();
  const [mod, setMod] = useState<NotifModule>(selected);
  const [, start] = useTransition();
  const list = items.filter((i) => i.module === mod);
  const current = modules.find((m) => m.key === mod);
  const unreadIds = list.filter((i) => !i.read).map((i) => i.id);

  const choose = (k: NotifModule) => {
    setMod(k);
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
            <div className="divide-y divide-gray-50">
              {list.map((n) => (
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
          )}
        </section>
      </div>
    </div>
  );
}
