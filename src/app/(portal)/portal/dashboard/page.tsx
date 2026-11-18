export const dynamic = "force-dynamic";

import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { ArrowLeftRight } from "lucide-react";
import Link from "next/link";
import { isSuperAdmin } from "@/lib/roles";
import { T } from "@/components/i18n";
import AdminDashboard from "./AdminDashboard";
import { prisma } from "@/lib/prisma";
import { activeAnnouncements } from "@/lib/announcement";
import AnnouncementPanel from "./AnnouncementPanel";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ pengumuman?: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/portal");

  const user = session.user;
  const greeting = getGreeting();
  const superAdmin = isSuperAdmin(user.role);
  // Beranda versi Admin (running indikator, Task Admin sesuai kewenangan, Status Karyawan) untuk semua Admin dan Super Admin.
  const isAdmin = superAdmin || user.role === "ADMIN";
  const swapAsks = !superAdmin && user.id ? await prisma.shiftSwapRequest.count({ where: { partnerId: user.id, status: "MENUNGGU_REKAN" } }) : 0;

  // Pengumuman untuk semua karyawan, termasuk Admin (Super Admin bukan karyawan). Menu pribadi lewat Tombol HP.
  const announcements = superAdmin ? null : await activeAnnouncements();
  const openAnnouncement = (await searchParams).pengumuman;

  return (
    <div className={`p-4 sm:p-6 ${isAdmin ? "max-w-7xl" : "max-w-4xl"}`}>
      {/* Salam: di layar lebar tampil di bar atas (PortalShell); di HP tetap di sini. */}
      <div className="mb-6 lg:hidden">
        <p className="text-sm text-white/70"><T>{greeting}</T></p>
        <h1 className="text-2xl font-bold text-white mt-0.5">
          {isAdmin ? <><T>Selamat datang kembali</T>, {user.name}! 👋</> : user.name}
        </h1>
      </div>

      {swapAsks > 0 && (
        <Link href="/portal/tukar-shift" className="mb-6 flex items-center gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4 hover:bg-sky-100">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-500 text-white"><ArrowLeftRight size={18} /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-gray-900">{swapAsks} <T>permintaan tukar shift dari rekan</T></span>
            <span className="block text-xs text-gray-500"><T>Terima atau tolak sebelum diteruskan ke atasan.</T></span>
          </span>
          <span className="text-xs font-semibold text-brand"><T>Buka →</T></span>
        </Link>
      )}

      {isAdmin && (
        <div className="mb-6">
          <AdminDashboard isSuper={superAdmin} announcement={announcements ? <AnnouncementPanel items={announcements} openId={openAnnouncement} /> : undefined} />
        </div>
      )}

      {/* Karyawan: kotak Pengumuman. Untuk Admin posisinya diatur panel Admin. */}
      {announcements && !isAdmin && <AnnouncementPanel items={announcements} openId={openAnnouncement} />}
    </div>
  );
}

// Jam WIB (server Vercel memakai UTC).
function getGreeting() {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", hour: "2-digit", hour12: false }).format(new Date()));
  if (hour < 12) return "Selamat Pagi";
  if (hour < 15) return "Selamat Siang";
  if (hour < 18) return "Selamat Sore";
  return "Selamat Malam";
}
