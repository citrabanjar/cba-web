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

type User = { name: string; employeeId: string | null; role: string; menuAccess: string[] };
type Props = { user: User; children: React.ReactNode };

const initials = (name: string) => name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();

function Avatar({ name, size = "h-9 w-9 text-xs" }: { name: string; size?: string }) {
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand to-amber-400 font-bold text-white ${size}`}>
      {initials(name)}
    </span>
  );
}

function NavLinks({
  sections, pathname, onClose,
}: {
  sections: NavSection[]; pathname: string; onClose?: () => void;
}) {
  return (
    <nav className="flex-1 overflow-y-auto px-3 py-2">
      {sections.map((sec) => (
        <div key={sec.section} className="mb-3">
          <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-widest text-white/50">
            <T>{sec.section}</T>
          </p>
          {sec.items.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                aria-current={isActive ? "page" : undefined}
                className={[
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-white font-semibold text-brand shadow-md shadow-black/20"
                    : "font-medium text-white/80 hover:bg-white/10 hover:text-white",
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

// Gambar logo berlatar putih, jadi diberi kotak putih agar rapi di atas latar gelap.
function LogoBadge({ width }: { width: number }) {
  return (
    <span className="inline-flex rounded-xl bg-white px-3 py-2 shadow-md shadow-black/20">
      <Logo width={width} />
    </span>
  );
}

function LogoutButton() {
  return (
    <form action={logoutAction}>
      <button
        type="submit"
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-rose-200 transition-colors hover:bg-white/10 hover:text-white"
      >
        <LogOut size={17} />
        <T>Keluar</T>
      </button>
    </form>
  );
}

function UserCard({ user }: { user: User }) {
  const info = [user.employeeId, roleLabel(user.role)].filter(Boolean).join(" · ");
  return (
    <div className="mx-3 flex items-center gap-2.5 rounded-xl border border-white/15 bg-white/10 p-2.5">
      <Avatar name={user.name} />
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-white">{user.name}</p>
        <p className="truncate text-[11px] text-white/60">{info}</p>
      </div>
    </div>
  );
}

function SidebarBody({
  user, sections, pathname, onClose,
}: {
  user: User; sections: NavSection[]; pathname: string; onClose?: () => void;
}) {
  return (
    <>
      <div className="pb-3"><UserCard user={user} /></div>
      <NavLinks sections={sections} pathname={pathname} onClose={onClose} />
      <div className="border-t border-white/10 p-3"><LogoutButton /></div>
    </>
  );
}

export default function PortalShell({ user, children }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const sections = getNavSections(user.role, user.menuAccess);

  return (
    <div className="portal-theme min-h-screen">
      {/* Sidebar desktop */}
      <aside className="print:hidden fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-white/10 bg-white/5 backdrop-blur-xl lg:flex">
        <div className="flex h-16 shrink-0 items-center px-4"><LogoBadge width={180} /></div>
        <SidebarBody user={user} sections={sections} pathname={pathname} />
      </aside>

      {/* Header */}
      <header className="print:hidden fixed inset-x-0 top-0 z-20 flex h-16 items-center gap-3 border-b border-white/10 bg-white/5 px-4 backdrop-blur-xl lg:left-64 lg:px-6">
        <button
          onClick={() => setSidebarOpen(true)}
          aria-label="Buka menu"
          className="rounded-lg p-1 text-white hover:bg-white/10 lg:hidden"
        >
          <Menu size={22} />
        </button>
        <div className="lg:hidden"><LogoBadge width={150} /></div>
        <div className="ml-auto flex items-center gap-3">
          <LanguageSwitcher />
          <div className="hidden items-center gap-2.5 sm:flex">
            <Avatar name={user.name} size="h-8 w-8 text-[11px]" />
            <div className="text-right leading-tight">
              <p className="text-sm font-semibold text-white">{user.name}</p>
              <p className="text-[11px] text-white/60">{roleLabel(user.role)}</p>
            </div>
          </div>
        </div>
      </header>

      {/* Sidebar mobile */}
      {sidebarOpen && (
        <>
          <div className="fixed inset-0 z-50 bg-black/40 lg:hidden" onClick={() => setSidebarOpen(false)} />
          <aside className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-gradient-to-b from-ink to-brand-dark shadow-xl lg:hidden">
            <div className="flex h-16 shrink-0 items-center justify-between gap-3 px-4">
              <LogoBadge width={170} />
              <button
                onClick={() => setSidebarOpen(false)}
                aria-label="Tutup menu"
                className="rounded-lg p-1 text-white/70 hover:bg-white/10"
              >
                <X size={20} />
              </button>
            </div>
            <SidebarBody user={user} sections={sections} pathname={pathname} onClose={() => setSidebarOpen(false)} />
          </aside>
        </>
      )}

      {/* Konten */}
      <main className="min-w-0 pt-16 lg:ml-64 print:ml-0 print:p-0">{children}</main>
    </div>
  );
}
