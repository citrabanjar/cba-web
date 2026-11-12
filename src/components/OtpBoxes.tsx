"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check } from "lucide-react";

// Kotak OTP beranimasi (terinspirasi galeri codexr). Gaya dipilih acak setiap kali kotak dibuka:
// - merge   : saat benar, kotak-kotak meluncur ke tengah dan menyatu jadi lingkaran centang.
// - liquid  : kotak terisi cairan bergelombang dengan gelembung saat angka diketik.
// - shimmer : kotak aktif berpendar dengan tepi gradien berputar; saat benar kilau menyapu semua kotak.
// - pop     : angka meletup masuk sambil berputar; saat benar kotak melompat bergelombang.
// - flip    : angka berputar 3D seperti papan skor; saat benar semua kotak membalik hijau.
// Kode salah → semua kotak bergetar lalu dikosongkan.
export type OtpStatus = "idle" | "checking" | "success" | "error";
export const OTP_STYLES = ["merge", "liquid", "shimmer", "pop", "flip"] as const;
type Style = (typeof OTP_STYLES)[number];

export default function OtpBoxes({ value, onChange, status, length = 6, disabled }: {
  value: string; onChange: (v: string) => void; status: OtpStatus; length?: number; disabled?: boolean;
}) {
  const [style] = useState<Style>(() => OTP_STYLES[Math.floor(Math.random() * OTP_STYLES.length)]);
  const [focused, setFocused] = useState(true);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => { if (status === "error") input.current?.focus(); }, [status]);

  const digits = Array.from({ length }, (_, i) => value[i] ?? "");
  const active = Math.min(value.length, length - 1);
  const ok = status === "success";
  const bad = status === "error";
  const mid = (length - 1) / 2;

  return (
    <div className="relative" data-otp-style={style}>
      <input
        ref={input} inputMode="numeric" autoComplete="one-time-code" maxLength={length} value={value} disabled={disabled || ok}
        aria-label="Kode OTP"
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, length))}
        className="absolute inset-0 z-10 h-full w-full cursor-text opacity-0"
      />
      <motion.div
        className="relative flex justify-center gap-2"
        animate={bad ? { x: [0, -10, 10, -8, 8, -4, 4, 0] } : { x: 0 }}
        transition={{ duration: 0.45 }}
      >
        {digits.map((d, i) => {
          const isActive = focused && i === active && !ok && value.length < length;
          const filled = !!d;
          // Gerak saat berhasil, per gaya.
          const successAnim =
            style === "merge" ? { x: (mid - i) * 52, scale: 0.6, opacity: 0 }
            : style === "pop" ? { y: [0, -14, 0], transition: { delay: i * 0.06, duration: 0.45 } }
            : style === "flip" ? { rotateY: [0, 180, 360], transition: { delay: i * 0.07, duration: 0.6 } }
            : {};
          return (
            <motion.div
              key={i}
              animate={ok ? successAnim : { x: 0, y: 0, scale: isActive ? 1.06 : 1, opacity: 1, rotateY: 0 }}
              transition={{ type: "spring", stiffness: 320, damping: 22, delay: ok && style === "merge" ? 0.05 * Math.abs(mid - i) : 0 }}
              style={{ perspective: 600 }}
              className={`relative flex h-12 w-10 items-center justify-center overflow-hidden rounded-xl border text-xl font-bold text-white sm:h-14 sm:w-12 ${
                ok ? "border-emerald-300 bg-emerald-500/30"
                  : bad ? "border-rose-300 bg-rose-500/20"
                  : isActive ? "border-white bg-white/15 shadow-[0_0_18px_rgba(255,255,255,0.35)]"
                  : filled ? "border-white/50 bg-white/10" : "border-white/20 bg-white/5"
              }`}
            >
              {/* liquid: cairan naik saat angka terisi */}
              {style === "liquid" && (
                <motion.span
                  className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-rose-500/70 to-rose-300/40"
                  animate={{ height: filled || ok ? "85%" : "0%" }}
                  transition={{ type: "spring", stiffness: 120, damping: 14 }}
                >
                  <span className="otp-wave absolute -top-2 left-[-50%] h-3 w-[200%] rounded-[50%] bg-rose-300/50" />
                  {filled && <span className="otp-bubble absolute bottom-1 left-1/3 h-1.5 w-1.5 rounded-full bg-white/70" />}
                </motion.span>
              )}
              {/* shimmer: tepi gradien berputar di kotak aktif, kilau menyapu saat berhasil */}
              {style === "shimmer" && isActive && <span className="otp-ring pointer-events-none absolute -inset-[2px] -z-0 rounded-xl" />}
              {style === "shimmer" && ok && <span className="otp-sweep pointer-events-none absolute inset-0" style={{ animationDelay: `${i * 60}ms` }} />}

              <AnimatePresence mode="popLayout">
                {d ? (
                  <motion.span
                    key={d + i}
                    className="relative z-[1]"
                    initial={style === "pop" ? { scale: 0, rotate: -90, opacity: 0 } : style === "flip" ? { rotateX: -90, opacity: 0 } : { y: 14, opacity: 0 }}
                    animate={{ scale: 1, rotate: 0, rotateX: 0, y: 0, opacity: 1 }}
                    exit={{ opacity: 0, scale: 0.6 }}
                    transition={{ type: "spring", stiffness: 420, damping: 20 }}
                  >
                    {d}
                  </motion.span>
                ) : isActive ? (
                  <motion.span key="caret" className="relative z-[1] h-6 w-0.5 rounded bg-white" animate={{ opacity: [1, 0, 1] }} transition={{ repeat: Infinity, duration: 1 }} />
                ) : null}
              </AnimatePresence>
            </motion.div>
          );
        })}

        {/* merge: lingkaran centang muncul di tengah setelah kotak menyatu */}
        <AnimatePresence>
          {ok && style === "merge" && (
            <motion.div
              className="absolute left-1/2 top-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-emerald-500 text-white shadow-[0_0_30px_rgba(16,185,129,0.7)]"
              initial={{ scale: 0, opacity: 0 }} animate={{ scale: [0, 1.25, 1], opacity: 1 }} transition={{ delay: 0.35, duration: 0.5 }}
            >
              <Check size={28} strokeWidth={3} />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
      {status === "checking" && (
        <motion.div className="mt-3 h-1 overflow-hidden rounded-full bg-white/10">
          <motion.div className="h-full w-1/3 rounded-full bg-white/70" animate={{ x: ["-100%", "300%"] }} transition={{ repeat: Infinity, duration: 0.9, ease: "easeInOut" }} />
        </motion.div>
      )}
    </div>
  );
}
