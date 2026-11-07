"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { AnimatePresence, motion } from "motion/react";
import {
  Home, Clock, Calendar, Briefcase, FileText, ChevronLeft, ChevronRight,
  Receipt, Users, LogOut, Menu, X, Settings, Network, Building2,
} from "lucide-react";
import { logoutAction } from "@/app/(portal)/auth-actions";
import { LanguageSwitcher, T, useT } from "@/components/i18n";
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

const WIDE = 256;
const NARROW = 78;
const SPRING = { type: "spring", stiffness: 380, damping: 32, mass: 0.8 } as const;
const COLLAPSE_KEY = "cba-sidebar-collapsed";

const initials = (name: string) => name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();

function Avatar({ name, size = "h-9 w-9 text-xs" }: { name: string; size?: string }) {
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand to-amber-400 font-bold text-white ${size}`}>
      {initials(name)}
    </span>
  );
}

// Ikon yang disorot membesar, tetangganya ikut sedikit membesar, seperti dock macOS.
const dockScale = (hovered: number | null, index: number) => {
  if (hovered === null) return 1;
  const d = Math.abs(hovered - index);
  return d === 0 ? 1.22 : d === 1 ? 1.1 : d === 2 ? 1.03 : 1;
};

function NavLinks({
  sections, pathname, collapsed, onClose,
}: {
  sections: NavSection[]; pathname: string; collapsed: boolean; onClose?: () => void;
}) {
  const t = useT();
  const [hovered, setHovered] = useState<number | null>(null);
  // Nomor urut menu di seluruh bagian, untuk efek dock.
  const starts = sections.map((_, k) => sections.slice(0, k).reduce((n, s) => n + s.items.length, 0));
  return (
    <nav className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-2" onMouseLeave={() => setHovered(null)}>
      {sections.map((sec, si) => (
        <div key={sec.section} className="mb-2">
          {collapsed ? (
            <div className="mx-auto my-2 h-px w-8 bg-white/15" />
          ) : (
            <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-widest text-white/50">
              <T>{sec.section}</T>
            </p>
          )}
          {sec.items.map((item, ii) => {
            const i = starts[si] + ii;
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                onMouseEnter={() => setHovered(i)}
                aria-current={isActive ? "page" : undefined}
                aria-label={collapsed ? t(item.label) : undefined}
                title={collapsed ? t(item.label) : undefined}
                className={[
                  "portal-nav-item group relative mb-0.5 flex h-10 items-center gap-3 rounded-xl text-sm transition-colors",
                  collapsed ? "justify-center px-0" : "px-3",
                  isActive
                    ? "bg-white font-semibold text-brand shadow-md shadow-black/20"
                    : "font-medium text-white/80 hover:bg-white/10 hover:text-white",
                ].join(" ")}
              >
                <motion.span
                  className="flex shrink-0"
                  animate={{ scale: dockScale(hovered, i) }}
                  transition={{ type: "spring", stiffness: 420, damping: 24 }}
                >
                  <item.icon size={18} />
                </motion.span>
                {!collapsed && <span className="truncate"><T>{item.label}</T></span>}
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

// Lambang oval merah CBA untuk menu samping yang dilipat.
function Emblem() {
  return (
    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white shadow-md shadow-black/20">
      <svg viewBox="0 0 94 80" width="30" height="26" aria-label="PT. Citra Banjar Abadi">
        <clipPath id="cba-oval"><ellipse cx="47" cy="40" rx="44" ry="37" /></clipPath>
        <ellipse cx="47" cy="40" rx="44" ry="37" fill="#BE353F" />
        <path d="M 6,26 A 44,37 0 0 1 69,8 L 69,33 L 56,33 L 56,47 L 69,47 L 47,72 Z" fill="#e0e0e0" clipPath="url(#cba-oval)" />
      </svg>
    </span>
  );
}

function LogoutButton({ collapsed = false }: { collapsed?: boolean }) {
  const t = useT();
  return (
    <form action={logoutAction}>
      <button
        type="submit"
        aria-label={collapsed ? t("Keluar") : undefined}
        title={collapsed ? t("Keluar") : undefined}
        className={`portal-nav-item relative flex h-10 w-full items-center gap-3 rounded-xl text-sm font-medium text-rose-200 transition-colors hover:bg-white/10 hover:text-white ${collapsed ? "justify-center" : "px-3"}`}
      >
        <LogOut size={17} />
        {!collapsed && <T>Keluar</T>}
      </button>
    </form>
  );
}

function UserCard({ user, collapsed = false }: { user: User; collapsed?: boolean }) {
  const info = [user.employeeId, roleLabel(user.role)].filter(Boolean).join(" · ");
  if (collapsed) {
    return (
      <div className="flex justify-center" title={user.name}>
        <Avatar name={user.name} />
      </div>
    );
  }
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

export default function PortalShell({ user, children }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const t = useT();
  const sections = getNavSections(user.role, user.menuAccess);

  // Pilihan lipat menu diingat di browser ini saja.
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (localStorage.getItem(COLLAPSE_KEY) === "1") setCollapsed(true);
    } catch {}
  }, []);

  function toggle() {
    setCollapsed((prev) => {
      try { localStorage.setItem(COLLAPSE_KEY, prev ? "0" : "1"); } catch {}
      return !prev;
    });
  }

  const width = collapsed ? NARROW : WIDE;

  return (
    <div className="portal-theme min-h-screen" style={{ "--sb": `${width}px` } as React.CSSProperties}>
      {/* Sidebar desktop */}
      <motion.aside
        className="print:hidden fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-white/10 bg-white/5 backdrop-blur-xl lg:flex"
        initial={false}
        animate={{ width }}
        transition={SPRING}
      >
        <div className={`relative flex h-16 shrink-0 items-center ${collapsed ? "justify-center" : "px-4"}`}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={collapsed ? "emblem" : "logo"}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -6 }}
              transition={{ duration: 0.15 }}
            >
              {collapsed ? <Emblem /> : <LogoBadge width={180} />}
            </motion.div>
          </AnimatePresence>
          <button
            type="button"
            onClick={toggle}
            aria-label={collapsed ? t("Buka menu") : t("Lipat menu")}
            className="portal-collapse-btn"
          >
            {collapsed ? <ChevronRight size={12} strokeWidth={3} /> : <ChevronLeft size={12} strokeWidth={3} />}
          </button>
        </div>
        <div className="pb-3 pt-1"><UserCard user={user} collapsed={collapsed} /></div>
        <NavLinks sections={sections} pathname={pathname} collapsed={collapsed} />
        <div className="border-t border-white/10 p-3"><LogoutButton collapsed={collapsed} /></div>
      </motion.aside>

      {/* Header */}
      <header className="print:hidden fixed inset-x-0 top-0 z-20 flex h-16 items-center gap-3 border-b border-white/10 bg-white/5 px-4 backdrop-blur-xl transition-[left] duration-300 lg:left-[var(--sb)] lg:px-6">
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
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-50 bg-black/40 lg:hidden"
              onClick={() => setSidebarOpen(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
            <motion.aside
              className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-gradient-to-b from-ink to-brand-dark shadow-xl lg:hidden"
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              transition={SPRING}
            >
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
              <div className="pb-3"><UserCard user={user} /></div>
              <NavLinks sections={sections} pathname={pathname} collapsed={false} onClose={() => setSidebarOpen(false)} />
              <div className="border-t border-white/10 p-3"><LogoutButton /></div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Konten */}
      <main className="min-w-0 pt-16 transition-[margin] duration-300 lg:ml-[var(--sb)] print:ml-0 print:p-0">{children}</main>
    </div>
  );
}
