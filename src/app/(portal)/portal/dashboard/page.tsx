export const dynamic = "force-dynamic";

import { auth } from "@/auth";
import { redirect } from "next/navigation";
import {
  Clock, CalendarDays, Briefcase, FileText,
  Receipt, TrendingUp, AlertCircle,
} from "lucide-react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { getAccess } from "@/lib/access";
import { hasMenu, isSuperAdmin, roleLabel } from "@/lib/roles";
import { T } from "@/components/i18n";
import AdminDashboard from "./AdminDashboard";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/portal");

  const user = session.user;
  const greeting = getGreeting();
  const access = await getAccess();
  const isAdmin = hasMenu(access, "karyawan");
  const superAdmin = isSuperAdmin(user.role);

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
            <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center shrink-0">
              <TrendingUp size={18} className="text-gray-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-700"><T>Belum Check-in</T></p>
              <p className="text-xs text-gray-400"><T>Lakukan absensi sekarang</T></p>
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
