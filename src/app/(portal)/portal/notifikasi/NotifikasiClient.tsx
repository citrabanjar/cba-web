"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Bell, Briefcase, Check, ChevronLeft, Landmark, Loader2, Users, X, CalendarCheck, CalendarDays, CheckCheck, ChevronRight, ClipboardCheck, HandCoins, Timer, UserRound, type LucideIcon } from "lucide-react";
import { T, useT } from "@/components/i18n";
import type { NotifModule } from "@/lib/notif-modules";
import { markNotificationsRead } from "@/app/(portal)/notif-actions";
import { respondSpl } from "@/app/(portal)/portal/lembur/actions";
import { OT_STATUS } from "@/lib/overtime-status";
import { respondSwap } from "@/app/(portal)/portal/tukar-shift/actions";
import { Card, EditCard, ProfileCard, SwapCard, type ApprovalItem, type EditItem, type ProfileItem, type SwapItem } from "@/app/(portal)/portal/persetujuan/PersetujuanClient";
import { formatDate, formatDateTime } from "@/lib/utils";

// action: notifikasi yang dijawab langsung di halaman ini (SPL: Bersedia / Tidak bersedia).
type Action = { kind: "spl"; id: string; status: string };
type Item = { id: string; title: string; body: string | null; href: string | null; read: boolean; at: string; module: NotifModule; action: Action | null };
type Mod = { key: NotifModule; label: string; total: number; unread: number; waiting: number };
type Partner = { type: "partner"; id: string; date: string; requester: string; requesterShift: string; partnerShift: string; reason: string | null };
// Pengajuan yang menunggu keputusan saya (atasan langsung / approver / rekan tukar shift), tampil di modulnya.
export type PendingCard = {
  module: NotifModule; key: string;
  card: { type: "item"; item: ApprovalItem } | { type: "swap"; s: SwapItem } | { type: "edit"; item: EditItem } | { type: "profile"; item: ProfileItem } | Partner;
};
// "persetujuan" = antrean pengajuan yang menunggu keputusan (atasan / approver / Admin).
export type Selected = NotifModule | "persetujuan";

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
  kehadiran: CalendarCheck, lembur: Timer, cuti: CalendarDays, dinas: Briefcase, pinjaman: HandCoins, profil: UserRound, payroll: Landmark, karyawan: Users, lainnya: Bell,
};

export default function NotifikasiClient({ modules, items, pending, selected, approvals, panel }: {
  modules: Mod[]; items: Item[]; pending: PendingCard[]; selected: Selected; approvals: number | null; panel: ReactNode;
}) {
  const t = useT();
  const router = useRouter();
  const [mod, setMod] = useState<Selected>(selected);
  const [loading, startLoad] = useTransition();
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
  const waiting = pending.filter((p) => p.module === mod);

  const choose = (k: Selected) => {
    setMod(k);
    setPage(1);
    // Isi Persetujuan sudah dimuat bersama halaman, jadi semua modul berganti di halaman yang sama.
    if (k === "persetujuan" && !panel) startLoad(() => router.replace("/portal/notifikasi?modul=persetujuan", { scroll: false }));
    else window.history.replaceState(null, "", `/portal/notifikasi?modul=${k}`);
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

      <div className="grid gap-4 md:grid-cols-[15rem_1fr]">
        {/* Modul bersusun ke bawah */}
        <nav className="h-fit overflow-hidden rounded-2xl border border-gray-200 bg-white">
          {approvals !== null && (
            <button type="button" onClick={() => choose("persetujuan")}
              className={`flex w-full items-center gap-3 border-b border-gray-200 px-4 py-3 text-left ${mod === "persetujuan" ? "bg-brand/10" : "hover:bg-gray-50"}`}>
              <ClipboardCheck size={18} className={mod === "persetujuan" ? "text-brand" : "text-gray-400"} />
              <span className={`flex-1 text-sm ${mod === "persetujuan" ? "font-semibold text-brand" : "text-gray-700"}`}><T>Persetujuan</T></span>
              {approvals > 0 && <span className="min-w-5 rounded-full bg-amber-400 px-1.5 text-center text-[10px] font-bold leading-5 text-ink">{approvals}</span>}
              <ChevronRight size={14} className={mod === "persetujuan" ? "text-brand" : "text-gray-300"} />
            </button>
          )}
          {modules.map((m) => {
            const Icon = ICONS[m.key];
            const on = m.key === mod;
            return (
              <button key={m.key} type="button" onClick={() => choose(m.key)}
                className={`flex w-full items-center gap-3 border-b border-gray-100 px-4 py-3 text-left last:border-b-0 ${on ? "bg-brand/10" : "hover:bg-gray-50"}`}>
                <Icon size={18} className={on ? "text-brand" : "text-gray-400"} />
                <span className={`flex-1 text-sm ${on ? "font-semibold text-brand" : "text-gray-700"}`}><T>{m.label}</T></span>
                {m.waiting > 0 && <span title={t("Menunggu keputusan Anda")} className="min-w-5 rounded-full bg-amber-400 px-1.5 text-center text-[10px] font-bold leading-5 text-ink">{m.waiting}</span>}
                {m.unread > 0 && <span className="min-w-5 rounded-full bg-brand px-1.5 text-center text-[10px] font-bold leading-5 text-white">{m.unread}</span>}
                <ChevronRight size={14} className={on ? "text-brand" : "text-gray-300"} />
              </button>
            );
          })}
        </nav>

        {/* Persetujuan: antrean keputusan lengkap (sama seperti menu Persetujuan lama) */}
        {mod === "persetujuan" ? (
          <div className="min-w-0">
            {panel && !loading ? panel : (
              <p className="flex items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-10 text-sm text-gray-400"><Loader2 size={15} className="animate-spin" /> <T>Memuat…</T></p>
            )}
          </div>
        ) : (
        /* Riwayat modul terpilih */
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
          {waiting.length > 0 && (
            <div className="space-y-3 border-b border-amber-100 bg-amber-50/60 p-3">
              <p className="px-1 text-xs font-semibold uppercase tracking-wide text-amber-700"><T>Menunggu keputusan Anda</T> · {waiting.length}</p>
              {waiting.map(({ key, card: c }) =>
                c.type === "item" ? <Card key={key} item={c.item} />
                  : c.type === "swap" ? <SwapCard key={key} s={c.s} />
                  : c.type === "edit" ? <EditCard key={key} item={c.item} />
                  : c.type === "profile" ? <ProfileCard key={key} item={c.item} />
                  : <PartnerCard key={key} c={c} />)}
            </div>
          )}
          {list.length === 0 ? (
            waiting.length > 0 ? null : <p className="px-4 py-10 text-center text-sm text-gray-400"><T>Belum ada notifikasi.</T></p>
          ) : (
            <>
            <div ref={scroller} className="divide-y divide-gray-50 md:max-h-[calc(100vh-18rem)] md:overflow-y-auto">
              {shown.map((n) => n.action ? <ActionItem key={n.id} item={n} action={n.action} /> : (
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
        )}
      </div>
    </div>
  );
}

// Notifikasi yang dijawab di tempat. SPL: Bersedia, atau Tidak bersedia dengan alasan; setelah dijawab tampil statusnya.
function ActionItem({ item: n, action }: { item: Item; action: Action }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [refusing, setRefusing] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const waiting = action.status === "MENUNGGU_KARYAWAN";
  const st = OT_STATUS[action.status] ?? { label: action.status, cls: "bg-gray-100 text-gray-600" };
  const answer = (accept: boolean) => start(async () => {
    setError("");
    const r = await respondSpl(action.id, accept, note);
    if (r.error) { setError(r.error); return; }
    if (!n.read) await markNotificationsRead(n.id);
    router.refresh();
  });
  const markRead = () => { if (!n.read) start(async () => { await markNotificationsRead(n.id); router.refresh(); }); };
  return (
    <div onClick={waiting ? undefined : markRead} className={`flex w-full gap-3 px-4 py-3 ${n.read ? "" : "bg-rose-50/40"} ${waiting ? "" : "cursor-default"}`}>
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read ? "bg-transparent" : "bg-brand"}`} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className={`text-sm ${n.read ? "text-gray-700" : "font-semibold text-gray-900"}`}>{n.title}</p>
          {!waiting && <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${st.cls}`}><T>{st.label}</T></span>}
        </div>
        {n.body && <p className="text-xs text-gray-500">{n.body.replace(/\s*Pilih Bersedia atau Tidak bersedia\.?$/, "")}</p>}
        <p className="mt-0.5 text-[11px] text-gray-400">{formatDateTime(n.at)}</p>
        {waiting && (
          <div className="mt-2.5">
            {refusing && (
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("Alasan tidak bersedia (wajib)")} autoFocus
                className="mb-2 h-9 w-full rounded-lg border border-gray-200 px-3 text-sm" />
            )}
            {error && <p className="mb-2 text-xs text-rose-600"><T>{error}</T></p>}
            <div className="flex flex-wrap gap-2">
              {refusing ? (
                <>
                  <button type="button" disabled={pending} onClick={() => answer(false)} className="inline-flex items-center gap-1 rounded-full bg-gray-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                    {pending ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />} <T>Kirim: Tidak bersedia</T>
                  </button>
                  <button type="button" disabled={pending} onClick={() => { setRefusing(false); setError(""); }} className="rounded-full px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100"><T>Batal</T></button>
                </>
              ) : (
                <>
                  <button type="button" disabled={pending} onClick={() => answer(true)} className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                    {pending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} <T>Bersedia</T>
                  </button>
                  <button type="button" disabled={pending} onClick={() => setRefusing(true)} className="rounded-full border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50"><T>Tidak bersedia</T></button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Rekan tukar shift: Terima → diteruskan ke atasan langsung kedua karyawan; Tolak dengan alasan.
function PartnerCard({ c }: { c: Partner }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const answer = (accept: boolean) => start(async () => {
    setError("");
    if (!accept && !note.trim()) { setError("Tulis alasan menolak."); return; }
    const r = await respondSwap(c.id, accept, note);
    if (r.error) setError(r.error); else router.refresh();
  });
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4">
      <p className="text-sm font-semibold text-gray-900"><T>Permintaan tukar shift</T></p>
      <p className="text-sm text-gray-700">{c.requester} · {formatDate(c.date)}</p>
      <p className="text-xs text-gray-500"><T>Anda masuk shift</T> <b>{c.requesterShift}</b>, <T>rekan masuk shift</T> <b>{c.partnerShift}</b></p>
      {c.reason && <p className="mt-1.5 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">{c.reason}</p>}
      {rejecting && (
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("Alasan menolak (wajib)")} autoFocus
          className="mt-3 h-9 w-full rounded-lg border border-gray-200 px-3 text-sm" />
      )}
      {error && <p className="mt-2 text-xs text-rose-600"><T>{error}</T></p>}
      <div className="mt-3 flex justify-end gap-2">
        {rejecting ? (
          <>
            <button type="button" disabled={pending} onClick={() => setRejecting(false)} className="rounded-full px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100"><T>Batal</T></button>
            <button type="button" disabled={pending} onClick={() => answer(false)} className="inline-flex items-center gap-1 rounded-full bg-gray-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
              {pending ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />} <T>Kirim: Tolak</T>
            </button>
          </>
        ) : (
          <>
            <button type="button" disabled={pending} onClick={() => setRejecting(true)} className="rounded-full border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50"><T>Tolak</T></button>
            <button type="button" disabled={pending} onClick={() => answer(true)} className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
              {pending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} <T>Terima</T>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
