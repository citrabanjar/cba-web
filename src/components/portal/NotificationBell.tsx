"use client";

// Lonceng notifikasi di bar atas: kabar untuk karyawan (pengajuan disetujui / ditolak, dll.) dan,
// bagi atasan / approver / Admin, jumlah pengajuan yang menunggu keputusannya.
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, ClipboardCheck } from "lucide-react";
import { T, useT } from "@/components/i18n";
import { markNotificationsRead } from "@/app/(portal)/notif-actions";

export type NotificationItem = { id: string; title: string; body: string | null; href: string | null; read: boolean; at: string };

const ago = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (m < 1) return "baru saja";
  if (m < 60) return `${m} menit lalu`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} jam lalu`;
  return `${Math.round(h / 24)} hari lalu`;
};

export default function NotificationBell({ items, approvals, active }: { items: NotificationItem[]; approvals: number | null; active: boolean }) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [, start] = useTransition();
  const box = useRef<HTMLDivElement>(null);
  const unread = items.filter((i) => !i.read).length;
  const badge = unread + (approvals ?? 0);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const go = (href: string | null, id?: string) => {
    setOpen(false);
    start(async () => {
      if (id) await markNotificationsRead(id);
      if (href) router.push(href); else router.refresh();
    });
  };

  return (
    <div ref={box} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-label={t("Notifikasi")} title={t("Notifikasi")}
        className={`relative flex h-9 w-9 items-center justify-center rounded-full border text-white transition-colors ${open || active ? "border-white bg-white/25" : "border-white/20 bg-white/10 hover:bg-white/20"}`}>
        <Bell size={18} />
        {badge > 0 && (
          <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-amber-400 px-1.5 text-center text-[10px] font-bold leading-5 text-ink">{badge > 99 ? "99+" : badge}</span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <p className="text-sm font-semibold text-gray-900"><T>Notifikasi</T></p>
            {unread > 0 && (
              <button type="button" onClick={() => start(async () => { await markNotificationsRead(); router.refresh(); })}
                className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline">
                <CheckCheck size={13} /> <T>Tandai semua dibaca</T>
              </button>
            )}
          </div>

          {approvals !== null && (
            <button type="button" onClick={() => go("/portal/persetujuan")}
              className={`flex w-full items-center gap-3 border-b border-gray-100 px-4 py-3 text-left hover:bg-gray-50 ${approvals > 0 ? "bg-amber-50/70" : ""}`}>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-400 text-ink"><ClipboardCheck size={15} /></span>
              <span className="min-w-0 flex-1 text-sm">
                <span className="block font-semibold text-gray-900">{approvals > 0 ? <>{approvals} <T>pengajuan menunggu persetujuan Anda</T></> : <T>Tidak ada pengajuan yang menunggu</T>}</span>
                <span className="block text-xs text-brand"><T>Buka Persetujuan →</T></span>
              </span>
            </button>
          )}

          <div className="max-h-[60vh] overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-gray-400"><T>Belum ada notifikasi.</T></p>
            ) : items.map((n) => (
              <button key={n.id} type="button" onClick={() => go(n.href, n.read ? undefined : n.id)}
                className={`flex w-full gap-3 border-b border-gray-50 px-4 py-3 text-left last:border-b-0 hover:bg-gray-50 ${n.read ? "" : "bg-rose-50/40"}`}>
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read ? "bg-transparent" : "bg-brand"}`} />
                <span className="min-w-0 flex-1">
                  <span className={`block text-sm ${n.read ? "text-gray-700" : "font-semibold text-gray-900"}`}>{n.title}</span>
                  {n.body && <span className="block text-xs text-gray-500">{n.body}</span>}
                  <span className="mt-0.5 block text-[11px] text-gray-400"><T>{ago(n.at)}</T></span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
