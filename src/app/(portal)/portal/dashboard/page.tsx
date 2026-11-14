export const dynamic = "force-dynamic";

import { auth } from "@/auth";
import { redirect } from "next/navigation";
import {
  Clock, CalendarDays, Briefcase, FileText,
  Receipt, TrendingUp, AlertCircle, CheckCircle2, ClipboardCheck, LogOut, ArrowLeftRight,
} from "lucide-react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { getAccess } from "@/lib/access";
import { hasMenu, isSuperAdmin, roleLabel } from "@/lib/roles";
import { T } from "@/components/i18n";
import AdminDashboard from "./AdminDashboard";
import IndicatorCards from "./IndicatorCards";
import { loadIndicators } from "./insights";
import { prisma } from "@/lib/prisma";
import { openAttendance } from "@/lib/attendance-assess";
import { isApprover, pendingApprovals } from "@/lib/approval";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/portal");

  const user = session.user;
  const greeting = getGreeting();
  const access = await getAccess();
  const isAdmin = hasMenu(access, "karyawan");
  const superAdmin = isSuperAdmin(user.role);
  // Status absen hari ini (shift malam kemarin yang belum pulang ikut terhitung).
  const att = !superAdmin && user.id ? await openAttendance(user.id) : null;
  const fmtTime = (d: Date) => d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
  // Atasan langsung (bukan admin): kartu pengajuan bawahan yang menunggu persetujuan.
  const approver = access && !isAdmin ? { id: access.id, role: access.role, menuAccess: access.menuAccess } : null;
  const toApprove = approver && (await isApprover(approver)) ? await pendingApprovals(approver) : 0;
  // Running indikator: Super Admin dan semua Admin. Admin tanpa menu Data Karyawan tidak membuka panel admin, jadi kartunya dimuat di sini.
  const indicatorOnly = !isAdmin && (user.role === "ADMIN" || superAdmin) ? await loadIndicators() : null;
  const swapAsks = !superAdmin && user.id ? await prisma.shiftSwapRequest.count({ where: { partnerId: user.id, status: "MENUNGGU_REKAN" } }) : 0;

  const menuItems = [
    ...(superAdmin ? [] : [
    {
      href: "/portal/absensi",
      icon: Clock,
      label: "Absensi",
      desc: "Check-in & Check-out",
    },
    {
      href: "/portal/cuti",
      icon: CalendarDays,
      label: "Cuti",
      desc: "Pengajuan cuti",
    },
    {
      href: "/portal/dinas",
      icon: Briefcase,
      label: "Dinas Luar",
      desc: "Pengajuan dinas",
    },
    {
      href: "/portal/payslip",
      icon: FileText,
      label: "Slip Gaji",
      desc: "Riwayat pembayaran",
    },
    {
      href: "/portal/pph21",
      icon: Receipt,
      label: "PPh 21",
      desc: "Bukti potong pajak",
    },
    ]),
  ];

  return (
    <div className={`p-4 sm:p-6 ${isAdmin ? "max-w-7xl" : "max-w-4xl"}`}>
      {/* Welcome */}
      <div className="mb-6">
        <p className="text-sm text-white/70"><T>{greeting}</T></p>
        <h1 className="text-2xl font-bold text-white mt-0.5">
          {isAdmin ? <><T>Selamat datang kembali</T>, {user.name}! 👋</> : user.name}
        </h1>
        {isAdmin && <p className="text-sm text-white/80 mt-1"><T>Berikut ringkasan perusahaan hari ini.</T></p>}
        <p className="text-xs text-white/60 mt-0.5">
          {[user.employeeId, roleLabel(user.role), superAdmin ? null : user.employmentStatus]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>

      {/* Status hari ini */}
      {!superAdmin && <Card className="mb-6 border-gray-200">
        <CardContent className="pt-4 pb-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
            <T>Status Hari Ini</T>
          </p>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${att?.checkOut ? "bg-blue-50" : att?.checkIn ? "bg-emerald-50" : "bg-gray-100"}`}>
              {att?.checkOut ? <LogOut size={18} className="text-blue-500" /> : att?.checkIn ? <CheckCircle2 size={18} className="text-emerald-600" /> : <TrendingUp size={18} className="text-gray-400" />}
            </div>
            <div>
              {att?.checkOut ? (
                <><p className="text-sm font-semibold text-gray-700"><T>Absensi hari ini selesai</T></p>
                  <p className="text-xs text-gray-400"><T>Masuk</T> {fmtTime(att.checkIn!)} · <T>Pulang</T> {fmtTime(att.checkOut)}</p></>
              ) : att?.checkIn ? (
                <><p className="text-sm font-semibold text-gray-700"><T>Sudah Check-in</T> {fmtTime(att.checkIn)}</p>
                  <p className="text-xs text-gray-400"><T>Jangan lupa check-out saat pulang</T></p></>
              ) : (
                <><p className="text-sm font-semibold text-gray-700"><T>Belum Check-in</T></p>
                  <p className="text-xs text-gray-400"><T>Lakukan absensi sekarang</T></p></>
              )}
            </div>
            <Link
              href="/portal/absensi"
              className="ml-auto text-xs font-semibold text-brand bg-brand/10 border border-brand/20 px-3 py-1.5 rounded-lg hover:bg-brand/15 transition-colors"
            >
              <T>Absen →</T>
            </Link>
          </div>
        </CardContent>
      </Card>}

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

      {toApprove > 0 && (
        <Link href="/portal/persetujuan" className="mb-6 flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 hover:bg-amber-100">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-400 text-ink"><ClipboardCheck size={18} /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-gray-900">{toApprove} <T>pengajuan menunggu persetujuan Anda</T></span>
            <span className="block text-xs text-gray-500"><T>Cuti dan dinas luar dari karyawan yang Anda pimpin langsung.</T></span>
          </span>
          <span className="text-xs font-semibold text-brand"><T>Buka →</T></span>
        </Link>
      )}

      {indicatorOnly && indicatorOnly.length > 0 && (
        <div className="mb-6">
          <IndicatorCards items={indicatorOnly} />
        </div>
      )}

      {isAdmin && (
        <div className="mb-6">
          <AdminDashboard isSuper={superAdmin} />
        </div>
      )}

      {/* Menu */}
      {menuItems.length > 0 && <div>
        <p className="text-xs font-semibold text-white/70 uppercase tracking-wide mb-3">
          <T>Menu</T>
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {menuItems.map((item) => (
            <Link key={item.href} href={item.href}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer h-full border-gray-200 border-l-4 border-l-brand">
                <CardContent className="pt-4 pb-4">
                  <item.icon size={24} className="text-brand mb-3" />
                  <p className="font-semibold text-gray-800 text-sm"><T>{item.label}</T></p>
                  <p className="text-xs text-gray-400 mt-0.5"><T>{item.desc}</T></p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>}

      {/* Info */}
      {!superAdmin && <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-start gap-3 mt-6">
        <AlertCircle size={18} className="text-brand mt-0.5 shrink-0" />
        <p className="text-xs text-gray-600">
          <T>Butuh bantuan? Hubungi HRD melalui email atau datang langsung ke kantor.</T>
        </p>
      </div>}
    </div>
  );
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Selamat Pagi";
  if (hour < 15) return "Selamat Siang";
  if (hour < 18) return "Selamat Sore";
  return "Selamat Malam";
}
