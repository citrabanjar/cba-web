"use client";

// Tab Profil Saya: data diri karyawan dan menu harian (Absensi, Cuti, Dinas Luar, Tukar Shift) dalam satu tempat.
// Dipasang di atas halaman Profil Saya dan halaman-halaman menu harian itu.
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ArrowLeftRight, Briefcase, Calendar, CalendarDays, Clock, Plane, User, UserCog } from "lucide-react";
import { T } from "@/components/i18n";

export const PROFILE_TABS = [
  { href: "/portal/profil", tab: "data", label: "Data Diri", icon: User },
  { href: "/portal/profil?tab=kerja", tab: "kerja", label: "Pekerjaan", icon: Briefcase },
  { href: "/portal/profil?tab=hadir", tab: "hadir", label: "Kehadiran", icon: CalendarDays },
  { href: "/portal/absensi", label: "Absensi", icon: Clock },
  { href: "/portal/cuti", label: "Cuti", icon: Calendar },
  { href: "/portal/dinas", label: "Dinas Luar", icon: Plane },
  { href: "/portal/tukar-shift", label: "Tukar Shift", icon: ArrowLeftRight },
  { href: "/portal/profil?tab=akun", tab: "akun", label: "Akun", icon: UserCog },
] as const;

// Alamat yang termasuk Profil Saya (untuk menandai menu sidebar).
export const PROFILE_PATHS = ["/portal/profil", "/portal/absensi", "/portal/cuti", "/portal/dinas", "/portal/tukar-shift"];

export default function ProfileTabs({ className = "" }: { className?: string }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const current = params.get("tab") ?? "data";
  return (
    <div className={`flex gap-1 overflow-x-auto rounded-2xl border border-gray-200 bg-white p-1.5 ${className}`}>
      {PROFILE_TABS.map((item) => {
        const active = "tab" in item ? pathname === "/portal/profil" && current === item.tab : pathname === item.href;
        const Icon = item.icon;
        return (
          <Link key={item.href} href={item.href} scroll={false} aria-current={active ? "page" : undefined}
            className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm ${active ? "bg-ink font-semibold text-white" : "text-gray-500 hover:bg-gray-100"}`}>
            <Icon size={15} /> <T>{item.label}</T>
          </Link>
        );
      })}
    </div>
  );
}
