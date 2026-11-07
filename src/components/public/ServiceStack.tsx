"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { ArrowUpRight, Briefcase, HardHat, Wrench, type LucideIcon } from "lucide-react";
import { T } from "@/components/i18n";

type Service = { id: number; icon: LucideIcon; title: string; tag: string; desc: string; tone: string };

// Warna kartu: merah CBA, abu tua, dan jingga, supaya ketiganya mudah dibedakan.
const SERVICES: Service[] = [
  {
    id: 1,
    icon: HardHat,
    title: "Konstruksi & Sipil",
    tag: "Gedung & Infrastruktur",
    desc: "Pembangunan gedung, infrastruktur, dan fasilitas umum dengan standar kualitas tinggi.",
    tone: "linear-gradient(to top, #be353f 0%, rgb(190 53 63 / 0.85) 30%, rgb(232 106 114 / 0.55) 60%, #f4c7ca 100%)",
  },
  {
    id: 2,
    icon: Wrench,
    title: "Mekanikal & Elektrikal",
    tag: "Instalasi & Perawatan",
    desc: "Instalasi, perawatan, dan perbaikan sistem mekanikal dan elektrikal industri.",
    tone: "linear-gradient(to top, #333336 0%, rgb(51 51 54 / 0.88) 30%, rgb(100 100 110 / 0.6) 60%, #c9cad1 100%)",
  },
  {
    id: 3,
    icon: Briefcase,
    title: "Jasa Teknik",
    tag: "Konsultasi & Manajemen Proyek",
    desc: "Konsultasi teknik, desain, dan manajemen proyek untuk berbagai kebutuhan industri.",
    tone: "linear-gradient(to top, #d97706 0%, rgb(217 119 6 / 0.85) 30%, rgb(245 158 11 / 0.55) 60%, #fde3b0 100%)",
  },
];

// Kartu depan bisa digeser atau diklik untuk pindah ke belakang; kartu belakang diklik untuk maju.
export default function ServiceStack() {
  const [cards, setCards] = useState(SERVICES);
  const dragged = useRef(false);
  const sendBack = () => setCards((c) => [c[1], c[2], c[0]]);
  const bringFront = (id: number) =>
    setCards((c) => {
      const i = c.findIndex((x) => x.id === id);
      return i <= 0 ? c : [...c.slice(i), ...c.slice(0, i)];
    });

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="service-stack">
        {cards.map((card, index) => {
          const front = index === 0;
          const Icon = card.icon;
          return (
            <motion.div
              key={card.id}
              className={`service-card ${front ? "is-front" : "is-behind"}`}
              style={{ zIndex: 3 - index }}
              animate={{ x: index * 54, y: index * 40 }}
              transition={{ type: "spring", stiffness: 250, damping: 24, mass: 0.8 }}
              drag={front ? "x" : false}
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.6}
              onDragStart={() => { dragged.current = true; }}
              onDragEnd={(_, info) => {
                if (Math.abs(info.offset.x) > 48 || Math.abs(info.velocity.x) > 200) sendBack();
                setTimeout(() => { dragged.current = false; }, 0);
              }}
              whileDrag={{ scale: 1.03 }}
              whileHover={front ? undefined : { y: index * 40 - 6 }}
              onClick={() => {
                if (dragged.current) return;
                if (front) sendBack();
                else bringFront(card.id);
              }}
            >
              <div className="service-media" style={{ background: card.tone }}>
                <span className="pattern" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Icon size={92} strokeWidth={1.4} className="text-white drop-shadow-[0_8px_20px_rgb(0_0_0/0.25)]" />
                </div>
                <span className="absolute left-4 top-4 rounded-full bg-white/40 px-3 py-1 text-[11px] font-semibold text-gray-900 backdrop-blur-md">
                  0{card.id}
                </span>
                <p className="absolute inset-x-5 bottom-4 text-sm leading-snug text-white/95">
                  <T>{card.desc}</T>
                </p>
              </div>
              <div className="flex items-center justify-between gap-3 px-1 pt-3.5">
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-bold tracking-tight"><T>{card.title}</T></p>
                  <p className="truncate text-xs text-gray-500"><T>{card.tag}</T></p>
                </div>
                <Link
                  href="/#kontak"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-[#17181c] px-3 text-xs font-semibold text-white hover:bg-[#2a2b31]"
                >
                  <T>Konsultasi</T> <ArrowUpRight size={14} />
                </Link>
              </div>
            </motion.div>
          );
        })}
      </div>
      <p className="text-xs text-white/55"><T>Geser atau klik kartu untuk melihat layanan lain</T></p>
    </div>
  );
}
