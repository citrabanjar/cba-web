import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeftRight, Briefcase, CalendarDays, Clock, FileText, HandCoins, Receipt } from "lucide-react";
import { auth } from "@/auth";
import { Card, CardContent } from "@/components/ui/card";
import { T } from "@/components/i18n";
import { isSuperAdmin } from "@/lib/roles";

export const metadata: Metadata = { title: "Tombol HP" };

// Tombol menu pribadi karyawan (versi HP). Selama masa testing dibuka dari satu menu "Tombol HP" di sidebar web;
// saat live menu ini dihapus dari web (cukup di HP).
const HP_BUTTONS = [
  { href: "/portal/absensi", icon: Clock, label: "Absensi", desc: "Check-in & Check-out" },
  { href: "/portal/cuti", icon: CalendarDays, label: "Cuti", desc: "Pengajuan cuti" },
  { href: "/portal/dinas", icon: Briefcase, label: "Dinas Luar", desc: "Pengajuan dinas" },
  { href: "/portal/tukar-shift", icon: ArrowLeftRight, label: "Tukar Shift", desc: "Tukar shift dengan rekan" },
  { href: "/portal/payslip", icon: FileText, label: "Slip Gaji", desc: "Riwayat pembayaran" },
  { href: "/portal/pph21", icon: Receipt, label: "PPh 21", desc: "Bukti potong pajak" },
  { href: "/portal/pinjaman", icon: HandCoins, label: "Pinjaman", desc: "Pengajuan & angsuran" },
];

export default async function TombolHpPage() {
  const session = await auth();
  if (!session?.user) redirect("/portal");
  if (isSuperAdmin(session.user.role)) redirect("/portal/dashboard");
  return (
    <div className="max-w-4xl p-4 sm:p-6">
      <h1 className="mb-1 text-2xl font-bold text-white"><T>Tombol HP</T></h1>
      <p className="mb-5 text-sm text-white/70"><T>Menu pribadi karyawan seperti tampilan di HP.</T></p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {HP_BUTTONS.map((item) => (
          <Link key={item.href} href={item.href}>
            <Card className="h-full cursor-pointer border-gray-200 border-l-4 border-l-brand transition-shadow hover:shadow-md">
              <CardContent className="pb-4 pt-4">
                <item.icon size={24} className="mb-3 text-brand" />
                <p className="text-sm font-semibold text-gray-800"><T>{item.label}</T></p>
                <p className="mt-0.5 text-xs text-gray-400"><T>{item.desc}</T></p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
