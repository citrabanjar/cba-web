"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  Home, Clock, Calendar, Briefcase, FileText,
  Receipt, Users, LogOut, Menu, X, ChevronDown,
} from "lucide-react";
import { logoutAction } from "@/app/(portal)/auth-actions";

type NavItem = { href: string; label: string; icon: React.ElementType };
type NavSection = { section: string; items: NavItem[] };

function getNavSections(role: string): NavSection[] {
  const sections: NavSection[] = [
    {
      section: "MENU UTAMA",
      items: [{ href: "/portal/dashboard", label: "Beranda", icon: Home }],
    },
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
  ];

  if (role === "ADMIN" || role === "HRD" || role === "MANAGER") {
    sections.push({
      section: "EMPLOYEE",
      items: [{ href: "/portal/admin/karyawan", label: "Data Karyawan", icon: Users }],
    });
  }

  return sections;
}

type Props = {
  user: { name: string; employeeId: string; role: string };
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
            {sec.section}
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
                    ? "text-[#c42828] bg-red-50 border-[#c42828]"
                    : "text-gray-600 hover:bg-gray-50 border-transparent",
                ].join(" ")}
              >
                <item.icon size={17} />
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

export default function PortalShell({ user, children }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const sections = getNavSections(user.role);
  const initials = user.name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* ── Desktop sidebar ── */}
      <aside className="hidden lg:flex w-60 bg-white border-r border-gray-200 flex-col fixed inset-y-0 left-0 z-30">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-gray-100 shrink-0">
          <Image
            src="/logo.svg"
            alt="PT Citra Banjar Abadi"
            width={180}
            height={28}
            priority
          />
        </div>

        <NavLinks sections={sections} pathname={pathname} />

        {/* User + logout */}
        <div className="border-t border-gray-100 p-4 shrink-0">
          <div className="flex items-center gap-2.5 mb-2">
            <div className="w-8 h-8 rounded-full bg-[#1e3a5f] flex items-center justify-center text-white text-xs font-bold shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-gray-800 truncate">
                {user.name}
              </p>
              <p className="text-[10px] text-gray-400">
                {user.employeeId} · {user.role}
              </p>
            </div>
          </div>
          <form action={logoutAction}>
            <button
              type="submit"
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-500 hover:bg-gray-50 rounded-lg transition-colors"
            >
              <LogOut size={15} />
              Keluar
            </button>
          </form>
        </div>
      </aside>

      {/* ── Mobile sidebar overlay ── */}
      {sidebarOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="fixed inset-y-0 left-0 w-72 bg-white z-50 flex flex-col lg:hidden shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
              <Image
                src="/logo.svg"
                alt="PT Citra Banjar Abadi"
                width={160}
                height={25}
              />
              <button
                onClick={() => setSidebarOpen(false)}
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
              <div className="flex items-center gap-2.5 mb-2">
                <div className="w-8 h-8 rounded-full bg-[#1e3a5f] flex items-center justify-center text-white text-xs font-bold shrink-0">
                  {initials}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-800 truncate">
                    {user.name}
                  </p>
                  <p className="text-[10px] text-gray-400">
                    {user.employeeId} · {user.role}
                  </p>
                </div>
              </div>
              <form action={logoutAction}>
                <button
                  type="submit"
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-500 hover:bg-gray-50 rounded-lg transition-colors"
                >
                  <LogOut size={15} />
                  Keluar
                </button>
              </form>
            </div>
          </aside>
        </>
      )}

      {/* ── Main area ── */}
      <div className="flex-1 flex flex-col lg:ml-60 min-w-0">
        {/* Mobile top bar */}
        <div className="lg:hidden bg-[#1e3a5f] text-white px-4 py-3 flex items-center justify-between shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1 rounded-lg hover:bg-white/10 transition-colors"
          >
            <Menu size={20} />
          </button>
          <span className="text-sm font-semibold">Portal Karyawan</span>
          <div className="w-8" />
        </div>

        {/* Page content */}
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
