"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, useMotionValue, useSpring, useTransform, type MotionValue } from "motion/react";
import { Menu, X } from "lucide-react";
import { LanguageSwitcher, T } from "@/components/i18n";
import "./site.css";

const links = [
  { href: "/#beranda", label: "Beranda" },
  { href: "/#layanan", label: "Layanan" },
  { href: "/#tentang", label: "Tentang Kami" },
  { href: "/#kontak", label: "Kontak" },
];

// Tautan membesar saat kursor mendekat, seperti dock macOS.
function DockLink({ href, label, mouseX }: { href: string; label: string; mouseX: MotionValue<number> }) {
  const ref = useRef<HTMLLIElement>(null);
  const distance = useTransform(mouseX, (x) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box || !Number.isFinite(x)) return 1000;
    return x - (box.x + box.width / 2);
  });
  const scale = useSpring(useTransform(distance, [-110, 0, 110], [1, 1.18, 1]), { mass: 0.1, stiffness: 240, damping: 16 });
  const y = useSpring(useTransform(distance, [-110, 0, 110], [0, -2, 0]), { mass: 0.1, stiffness: 240, damping: 16 });
  return (
    <motion.li ref={ref} style={{ scale, y }}>
      <Link href={href} className="site-nav-link">
        <span><T>{label}</T></span>
      </Link>
    </motion.li>
  );
}

// Huruf tombol bergelombang saat disentuh kursor.
function WaveText({ text }: { text: string }) {
  return (
    <span className="site-wave" aria-label={text}>
      {[...text].map((ch, i) => (
        <span key={i} aria-hidden style={{ animationDelay: `${i * 0.035}s` }}>
          {ch === " " ? " " : ch}
        </span>
      ))}
    </span>
  );
}

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const mouseX = useMotionValue(Infinity);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 30);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Garis tepi berkilau mengikuti posisi kursor.
  function track(e: React.MouseEvent) {
    const nav = navRef.current;
    if (!nav) return;
    const box = nav.getBoundingClientRect();
    nav.style.setProperty("--mx", `${e.clientX - box.left}px`);
  }

  return (
    <header className="site-nav-wrap">
      <motion.nav
        ref={navRef}
        aria-label="Navigasi utama"
        className={`site-nav ${scrolled ? "is-scrolled" : ""}`}
        initial={{ opacity: 0, y: -12, scaleX: 0.6 }}
        animate={{ opacity: 1, y: 0, scaleX: 1 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        onMouseMove={track}
        onMouseEnter={() => navRef.current?.style.setProperty("--glow", "1")}
        onMouseLeave={() => navRef.current?.style.setProperty("--glow", "0")}
      >
        <span className="site-nav-shine" aria-hidden />

        <Link href="/" className="site-nav-logo" aria-label="PT. Citra Banjar Abadi">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.jpg" alt="PT. Citra Banjar Abadi" />
        </Link>

        <ul
          className="site-nav-links"
          onMouseMove={(e) => mouseX.set(e.clientX)}
          onMouseLeave={() => mouseX.set(Infinity)}
        >
          {links.map((l) => <DockLink key={l.href} {...l} mouseX={mouseX} />)}
        </ul>

        <div className="site-nav-right">
          <LanguageSwitcher className="site-lang" />
          <div className="hidden items-center gap-2 sm:flex">
            <Link href="/portal" className="site-btn-glass">
              <WaveText text="Portal" />
            </Link>
            <Link href="/progress" className="site-btn-red">
              <T>Cek Progress</T>
            </Link>
          </div>
          <button
            type="button"
            className="site-nav-toggle"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Tutup menu" : "Buka menu"}
            aria-expanded={open}
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </motion.nav>

      {open && (
        <motion.div
          className="site-nav-drawer"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
        >
          {links.map((l) => (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)}>
              <T>{l.label}</T>
            </Link>
          ))}
          <div className="grid grid-cols-2 gap-2 pt-2">
            <Link href="/portal" className="site-btn-glass justify-center" onClick={() => setOpen(false)}>
              <T>Portal Karyawan</T>
            </Link>
            <Link href="/progress" className="site-btn-red justify-center" onClick={() => setOpen(false)}>
              <T>Cek Progress</T>
            </Link>
          </div>
        </motion.div>
      )}
    </header>
  );
}
