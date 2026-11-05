export const dynamic = "force-dynamic";

import { auth } from "@/auth";
import { redirect } from "next/navigation";
import {
  Clock, CalendarDays, Briefcase, FileText,
  Receipt, TrendingUp, AlertCircle, ShieldCheck,
} from "lucide-react";
import Link from "next/link";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/portal");

  const user = session.user;
  const greeting = getGreeting();
  const isAdmin = user.role === "ADMIN" || user.role === "HRD" || user.role === "MANAGER";

  const menuItems = [
    {
      href: "/portal/absensi",
      icon: Clock,
      label: "Absensi",
      desc: "Check-in & Check-out",
      color: "bg-blue-50 text-blue-700",
    },
    {
      href: "/portal/cuti",
      icon: CalendarDays,
      label: "Cuti",
      desc: "Pengajuan cuti",
      color: "bg-green-50 text-green-700",
    },
    {
      href: "/portal/dinas",
      icon: Briefcase,
      label: "Dinas Luar",
      desc: "Pengajuan dinas",
      color: "bg-amber-50 text-amber-700",
    },
    {
      href: "/portal/payslip",
      icon: FileText,
      label: "Slip Gaji",
      desc: "Riwayat pembayaran",
      color: "bg-purple-50 text-purple-700",
    },
    {
      href: "/portal/pph21",
      icon: Receipt,
      label: "PPh 21",
      desc: "Bukti potong pajak",
      color: "bg-red-50 text-red-700",
    },
    ...(isAdmin
      ? [
          {
            href: "/portal/admin/karyawan",
            icon: ShieldCheck,
            label: "Data Karyawan",
            desc: "Kelola data karyawan",
            color: "bg-slate-100 text-slate-700",
          },
        ]
      : []),
  ];

  return (
    <div className="p-6 max-w-4xl">
      {/* Welcome */}
      <div className="mb-6">
        <p className="text-sm text-gray-400">{greeting}</p>
        <h1 className="text-xl font-bold text-gray-800 mt-0.5">{user.name}</h1>
        <p className="text-xs text-gray-400 mt-0.5">
          {user.employeeId} &middot; {user.role} &middot; {user.employmentStatus}
        </p>
      </div>

      {/* Status hari ini */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-6">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
          Status Hari Ini
        </p>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
            <TrendingUp size={18} className="text-gray-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-700">Belum Check-in</p>
            <p className="text-xs text-gray-400">Lakukan absensi sekarang</p>
          </div>
          <Link
            href="/portal/absensi"
            className="ml-auto text-xs font-semibold text-[#c42828] bg-red-50 px-3 py-1.5 rounded-lg hover:bg-red-100 transition-colors"
          >
            Absen →
          </Link>
        </div>
      </div>

      {/* Menu */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
          Menu
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {menuItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 hover:shadow-md transition-shadow flex flex-col gap-3"
            >
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center ${item.color}`}
              >
                <item.icon size={20} />
              </div>
              <div>
                <p className="font-semibold text-gray-800 text-sm">{item.label}</p>
                <p className="text-xs text-gray-400 mt-0.5">{item.desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Info */}
      <div className="bg-blue-50 rounded-xl p-4 flex items-start gap-3 mt-6">
        <AlertCircle size={18} className="text-blue-600 mt-0.5 shrink-0" />
        <p className="text-xs text-blue-700">
          Butuh bantuan? Hubungi HRD melalui email atau datang langsung ke kantor.
        </p>
      </div>
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
