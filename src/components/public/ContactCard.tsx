"use client";

import { useState } from "react";
import { motion, useAnimation } from "motion/react";
import { ArrowRight, Mail, MessageSquare, User } from "lucide-react";
import { T, useT } from "@/components/i18n";
import { CONTACT_EMAIL } from "@/lib/site";

// Pesan dikirim lewat aplikasi email pengunjung (mailto), jadi tidak perlu server email.
export default function ContactCard() {
  const t = useT();
  const [sent, setSent] = useState(false);
  const plane = useAnimation();
  const color = useAnimation();

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const name = String(form.get("name") ?? "");
    const email = String(form.get("email") ?? "");
    const message = String(form.get("message") ?? "");
    setSent(true);
    await plane.start({ x: 150, y: 20, scale: 1.15, rotate: 10, transition: { duration: 0.55, ease: "easeOut" } });
    await color.start("done");
    plane.start({ x: 900, y: -700, scale: 0.8, rotate: -15, transition: { duration: 0.9, ease: "easeIn" } });
    const subject = `Pesan dari ${name} melalui citrabanjar.com`;
    const body = `${message}\n\n${name}\n${email}`;
    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  const faces: [string, string, string][] = [
    ["85,130 95,165 170,40", "#9e2a33", "#2b8a3e"],
    ["85,130 170,40 130,175", "#f4b6ba", "#8ce99a"],
    ["25,105 85,130 170,40", "#be353f", "#51cf66"],
    ["25,105 75,135 170,40", "#f9d3d5", "#b2f2bb"],
  ];

  return (
    <div className="relative mx-auto grid w-full max-w-4xl overflow-hidden rounded-[28px] bg-white text-gray-900 shadow-[0_40px_80px_-30px_rgb(10_0_3/0.7)] md:grid-cols-[1fr_1.15fr]">
      {/* Ilustrasi pesawat kertas */}
      <div className="relative hidden items-center justify-center overflow-hidden bg-gradient-to-br from-[#fbe9ea] to-[#f6d2d5] md:flex">
        <span className="absolute -left-16 -top-16 h-56 w-56 rounded-full bg-white/50" />
        <span className="absolute -bottom-20 left-10 h-64 w-64 rounded-full bg-brand/10" />
        <span className="absolute right-8 top-10 h-16 w-16 rounded-full bg-brand/15" />
        <motion.svg
          viewBox="0 0 200 200"
          width="250"
          height="250"
          style={{ overflow: "visible" }}
          initial={{ x: -20, y: 20 }}
          animate={plane}
        >
          <motion.g animate={{ opacity: sent ? 0 : 1 }} stroke="#4a2a30" strokeWidth="6" strokeLinecap="round">
            <path d="M30 150 L15 165" />
            <path d="M50 170 L35 185" />
            <path d="M70 150 L55 165" />
          </motion.g>
          <g stroke="#4a2a30" strokeWidth="5" strokeLinejoin="round">
            {faces.map(([points, from, to]) => (
              <motion.polygon
                key={points}
                points={points}
                initial="idle"
                variants={{ idle: { fill: from }, done: { fill: to, transition: { duration: 0.45 } } }}
                animate={color}
              />
            ))}
          </g>
        </motion.svg>
      </div>

      {/* Formulir */}
      <div className="relative p-7 sm:p-10">
        <h3 className="text-2xl font-bold tracking-tight"><T>Kirim Pesan</T></h3>
        <p className="mt-1 text-sm text-gray-500"><T>Ceritakan kebutuhan proyek Anda, tim kami akan segera menghubungi.</T></p>

        <motion.form
          onSubmit={submit}
          className="mt-6 flex flex-col gap-4"
          animate={{ opacity: sent ? 0 : 1, scale: sent ? 0.96 : 1, filter: sent ? "blur(4px)" : "none" }}
          style={{ pointerEvents: sent ? "none" : "auto" }}
        >
          <label className="contact-input">
            <User size={19} />
            <input name="name" placeholder={t("Nama lengkap")} required />
          </label>
          <label className="contact-input">
            <Mail size={19} />
            <input name="email" type="email" placeholder={t("Alamat email")} required />
          </label>
          <label className="contact-input is-area">
            <MessageSquare size={19} className="mt-0.5" />
            <textarea name="message" placeholder={t("Pesan...")} required />
          </label>
          <button type="submit" className="site-btn-red site-btn-lg mt-1 justify-center">
            <T>Kirim</T> <ArrowRight size={18} />
          </button>
        </motion.form>

        {sent && (
          <motion.div
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.6, duration: 0.45 }}
            className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center"
          >
            <svg width="72" height="72" viewBox="0 0 50 50" className="mb-4">
              <motion.circle cx="25" cy="25" r="22" fill="none" stroke="#2b8a3e" strokeWidth="3"
                initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.7, duration: 0.6 }} />
              <motion.path d="M16 26 l6 6 l12 -12" fill="none" stroke="#2b8a3e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
                initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 1.2, duration: 0.4 }} />
            </svg>
            <h4 className="text-xl font-bold text-[#2b8a3e]"><T>Pesan siap dikirim!</T></h4>
            <p className="mt-1 text-sm text-gray-500">
              <T>Aplikasi email Anda akan terbuka. Tekan Kirim di sana untuk menyelesaikan.</T>
            </p>
            <button type="button" onClick={() => { setSent(false); plane.set({ x: -20, y: 20, scale: 1, rotate: 0 }); color.set("idle"); }}
              className="mt-5 text-sm font-semibold text-brand hover:underline">
              <T>Tulis pesan lain</T>
            </button>
          </motion.div>
        )}
      </div>
    </div>
  );
}
