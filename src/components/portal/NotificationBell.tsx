"use client";

// Lonceng notifikasi di bar atas: membuka halaman Notifikasi (riwayat per modul). Angkanya = notifikasi belum dibaca
// ditambah, bagi atasan / approver / Admin, jumlah pengajuan yang menunggu keputusannya.
import Link from "next/link";
import { Bell } from "lucide-react";
import { useT } from "@/components/i18n";

export default function NotificationBell({ unread, approvals, active }: { unread: number; approvals: number | null; active: boolean }) {
  const t = useT();
  const badge = unread + (approvals ?? 0);
  return (
    <Link href="/portal/notifikasi" aria-label={t("Notifikasi")} title={t("Notifikasi")}
      className={`relative flex h-9 w-9 items-center justify-center rounded-full border text-white transition-colors ${active ? "border-white bg-white/25" : "border-white/20 bg-white/10 hover:bg-white/20"}`}>
      <Bell size={18} />
      {badge > 0 && (
        <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-amber-400 px-1.5 text-center text-[10px] font-bold leading-5 text-ink">{badge > 99 ? "99+" : badge}</span>
      )}
    </Link>
  );
}
