"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";

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
                className="text-sm text-gray-600 hover:text-navy font-medium transition-colors"
              >
                {l.label}
              </Link>
            ))}
          </nav>

          {/* CTA */}
          <div className="hidden md:flex items-center gap-3">
            <Link
              href="/portal"
              className="text-sm font-medium text-navy border border-navy px-4 py-2 rounded-lg hover:bg-navy hover:text-white transition-colors"
            >
              Portal Karyawan
            </Link>
            <Link
              href="/progress"
              className="text-sm font-medium bg-gold text-white px-4 py-2 rounded-lg hover:bg-amber-600 transition-colors"
            >
              Cek Progress
            </Link>
          </div>

          {/* Mobile toggle */}
          <button
            onClick={() => setOpen(!open)}
            className="md:hidden p-2 rounded-md text-gray-600 hover:text-navy"
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden border-t border-gray-100 bg-white px-4 py-4 flex flex-col gap-3">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="text-sm text-gray-700 font-medium py-2"
            >
              {l.label}
            </Link>
          ))}
          <div className="flex flex-col gap-2 pt-2 border-t border-gray-100">
            <Link
              href="/portal"
              onClick={() => setOpen(false)}
              className="text-sm font-medium text-center text-navy border border-navy px-4 py-2 rounded-lg"
            >
              Portal Karyawan
            </Link>
            <Link
              href="/progress"
              onClick={() => setOpen(false)}
              className="text-sm font-medium text-center bg-gold text-white px-4 py-2 rounded-lg"
            >
              Cek Progress
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
