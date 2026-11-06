"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { LanguageSwitcher, T } from "@/components/i18n";

const links = [
  { href: "/#tentang", label: "Tentang Kami" },
  { href: "/#layanan", label: "Layanan" },
  { href: "/#kontak", label: "Kontak" },
];

export default function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-white shadow-sm border-b border-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.jpg"
              alt="PT. Citra Banjar Abadi"
              className="h-9 w-auto"
            />
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-6">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="text-sm text-gray-600 hover:text-ink font-medium transition-colors"
              >
                <T>{l.label}</T>
              </Link>
            ))}
          </nav>

          {/* CTA */}
          <div className="hidden md:flex items-center gap-3">
            <LanguageSwitcher />
            <Link
              href="/portal"
              className="text-sm font-medium text-ink border border-ink px-4 py-2 rounded-lg hover:bg-ink hover:text-white transition-colors"
            >
              <T>Portal Karyawan</T>
            </Link>
            <Link
              href="/progress"
              className="text-sm font-medium bg-brand text-white px-4 py-2 rounded-lg hover:bg-brand-dark transition-colors"
            >
              <T>Cek Progress</T>
            </Link>
          </div>

          {/* Mobile toggle */}
          <button
            onClick={() => setOpen(!open)}
            className="md:hidden p-2 rounded-md text-gray-600 hover:text-ink"
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden border-t border-gray-100 bg-white px-4 py-4 flex flex-col gap-3">
          <LanguageSwitcher className="self-start" />
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="text-sm text-gray-700 font-medium py-2"
            >
              <T>{l.label}</T>
            </Link>
          ))}
          <div className="flex flex-col gap-2 pt-2 border-t border-gray-100">
            <Link
              href="/portal"
              onClick={() => setOpen(false)}
              className="text-sm font-medium text-center text-ink border border-ink px-4 py-2 rounded-lg"
            >
              <T>Portal Karyawan</T>
            </Link>
            <Link
              href="/progress"
              onClick={() => setOpen(false)}
              className="text-sm font-medium text-center bg-brand text-white px-4 py-2 rounded-lg"
            >
              <T>Cek Progress</T>
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
