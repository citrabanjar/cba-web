"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  Home, Clock, Calendar, Briefcase, FileText,
  Receipt, Users, LogOut, Menu, X, Settings, Network, Building2,
} from "lucide-react";
import { logoutAction } from "@/app/(portal)/auth-actions";
import { LanguageSwitcher, T } from "@/components/i18n";
import { hasMenu, isManagement, isSuperAdmin, roleLabel } from "@/lib/roles";

type NavItem = { href: string; label: string; icon: React.ElementType };
type NavSection = { section: string; items: NavItem[] };

function getNavSections(role: string, menuAccess: string[]): NavSection[] {
  const sections: NavSection[] = [
    {
      section: "MENU UTAMA",
      items: [{ href: "/portal/dashboard", label: "Beranda", icon: Home }],
    },
  ];

  // Menu pribadi hanya untuk karyawan; SUPER_ADMIN bukan karyawan.
  if (!isSuperAdmin(role)) sections.push(
    {
      section: "TIME",
      items: [
        { href: "/portal/absensi", label: "Absensi", icon: Clock },
        { href: "/portal/cuti", label: "Cuti", icon: Calendar },
        { href: "/portal/dinas", label: "Dinas Luar", icon: Briefcase },
      ],
    },
    {
      section: "FINANCE",
      items: [
        { href: "/portal/payslip", label: "Slip Gaji", icon: FileText },
        { href: "/portal/pph21", label: "PPh 21", icon: Receipt },
      ],
    },
  );

  if (hasMenu({ role, menuAccess }, "karyawan")) {
    sections.push({
      section: "EMPLOYEE",
      items: [{ href: "/portal/admin/karyawan", label: "Data Karyawan", icon: Users }],
    });
  }

  if (hasMenu({ role, menuAccess }, "perusahaan")) {
    sections.push({
      section: "COMPANY",
      items: [
        { href: "/portal/admin/perusahaan", label: "Struktur Organisasi", icon: Network },
        ...(isSuperAdmin(role)
          ? [{ href: "/portal/admin/setup", label: "Setup Organisasi", icon: Building2 }]
          : []),
      ],
    });
  }

  if (isManagement(role)) {
    sections.push({
      section: "ADMIN",
      items: [{ href: "/portal/admin/settings", label: "Pengaturan", icon: Settings }],
    });
  }

  return sections;
}

type Props = {
  user: { name: string; employeeId: string | null; role: string; menuAccess: string[] };
  children: React.ReactNode;
};

function NavLinks({
  sections,
  pathname,
  onClose,
}: {
  sections: NavSection[];
  pathname: string;
  onClose?: () => void;
}) {
  return (
    <nav className="flex-1 overflow-y-auto py-3">
      {sections.map((sec) => (
        <div key={sec.section} className="mb-2">
          <p className="px-5 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
            <T>{sec.section}</T>
          </p>
          {sec.items.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={[
                  "flex items-center gap-3 px-5 py-2.5 text-sm font-medium transition-colors border-l-2",
                  isActive
                    ? "text-white bg-ink border-brand"
                    : "text-gray-600 hover:bg-gray-100 border-transparent",
                ].join(" ")}
              >
                <item.icon size={17} />
                <T>{item.label}</T>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function Logo({ width }: { width: number }) {
  // public/logo.jpg berukuran 2339x341
  return (
    <Image
      src="/logo.jpg"
      alt="PT. Citra Banjar Abadi"
      width={width}
      height={Math.round((width * 341) / 2339)}
      priority
    />
  );
}

function LogoutButton({ className = "" }: { className?: string }) {
  return (
    <form action={logoutAction}>
      <button
        type="submit"
        className={`flex items-center justify-center gap-2 px-3 py-1.5 text-sm text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors ${className}`}
      >
        <LogOut size={15} />
        <T>Keluar</T>
      </button>
    </form>
  );
}

export default function PortalShell({ user, children }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const sections = getNavSections(user.role, user.menuAccess);
  const userInfo = [user.employeeId, roleLabel(user.role)].filter(Boolean).join(" · ");

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header atas, sama dengan form.citrabanjar.com */}
      <header className="print:hidden fixed top-0 inset-x-0 z-40 h-[68px] bg-white border-b-4 border-brand flex items-center gap-3 px-4 lg:px-5">
        <button
          onClick={() => setSidebarOpen(true)}
          aria-label="Buka menu"
          className="lg:hidden p-1 rounded-lg hover:bg-gray-100 text-gray-700"
        >
          <Menu size={22} />
        </button>
        <Logo width={230} />
        <LanguageSwitcher className="ml-auto" />
        <div className="hidden sm:flex items-center gap-4">
          <div className="text-right">
            <p className="text-sm font-bold text-ink uppercase leading-tight">{user.name}</p>
            <p className="text-xs text-gray-500">
              {userInfo}
            </p>
          </div>
          <LogoutButton />
        </div>
      </header>

      {/* Sidebar desktop */}
      <aside className="print:hidden hidden lg:flex w-60 bg-white border-r border-gray-200 flex-col fixed top-[68px] bottom-0 left-0 z-30">
        <NavLinks sections={sections} pathname={pathname} />
      </aside>

      {/* Sidebar mobile */}
      {sidebarOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-50 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="fixed inset-y-0 left-0 w-72 bg-white z-50 flex flex-col lg:hidden shadow-xl">
            <div className="flex items-center justify-between gap-3 px-4 py-4 border-b-4 border-brand shrink-0">
              <Logo width={200} />
              <button
                onClick={() => setSidebarOpen(false)}
                aria-label="Tutup menu"
                className="p-1 rounded-lg hover:bg-gray-100 text-gray-500"
              >
                <X size={20} />
              </button>
            </div>

            <NavLinks
              sections={sections}
              pathname={pathname}
              onClose={() => setSidebarOpen(false)}
            />

            <div className="border-t border-gray-100 p-4 shrink-0">
              <p className="text-sm font-bold text-ink uppercase truncate">{user.name}</p>
              <p className="text-xs text-gray-500 mb-3">
                {userInfo}
              </p>
              <LogoutButton className="w-full" />
            </div>
          </aside>
        </>
      )}

      {/* Konten */}
      <main className="pt-[68px] lg:ml-60 min-w-0 print:p-0 print:ml-0">{children}</main>
    </div>
  );
}
