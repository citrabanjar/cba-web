"use client";

// Desain OTP 28 — "Liquid OTP v2" dari galeri codexr, dipindahkan apa adanya:
// kotak berisi air (gelombang + gelembung), pipa penghubung bergelembung, kotak miring → menyatu jadi
// bola hijau → tetesan air hijau memantul → centang, ikon gembok Lottie yang berganti ke gembok bercentang hijau.
// Fase digerakkan oleh props.status (bukan kode benar buatan demo).

import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "motion/react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type ComponentType,
  type KeyboardEvent,
} from "react";
import type { LottieProps } from "lottie-react";
import lockLockedJson from "./lottie/lock-locked.json";
import lockGreenTickJson from "./lottie/lock-green-tick.json";
import { OTP_TEXT, type OtpDesignProps } from "./types";
import styles from "./OtpDesign28.module.css";

const Lottie = dynamic(
  () => import("lottie-react").then((m) => m.Lottie as ComponentType<LottieProps>),
  { ssr: false },
);

const LOCK_LOCKED: object = lockLockedJson as object;
// Seperti aslinya: potong 2 detik pertama (60 frame @30fps) animasi gembok bercentang hijau.
const LOCK_GREEN_TICK: object = { ...(lockGreenTickJson as object), ip: 60 };
// Satu putaran gembok hijau = (141 - 60) frame / 30 fps.
const TICK_LOOP_MS = Math.round(((141 - 60) / 30) * 1000); // 2700
const SUCCESS_HOLD_MS = 400; // jeda agar keadaan akhir terlihat
const SUCCESS_SAFETY_MS = TICK_LOOP_MS + SUCCESS_HOLD_MS + 1500; // bila event Lottie tak pernah datang

type Phase = "idle" | "tilting" | "merging" | "dropping" | "success";

// --- Gelembung acak (deterministik agar SSR = klien; aslinya Math.random per render) ---
type Bubble = { size: number; left: number; delay: number; duration: number };
function makeBubbles(seed: number): Bubble[] {
  let s = seed * 9301 + 49297;
  const rnd = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  return Array.from({ length: 12 }, () => ({
    size: rnd() * 5 + 3, // 3px – 8px
    left: rnd() * 80 + 10, // 10% – 90%
    delay: rnd() * 2, // 0s – 2s
    duration: rnd() * 1.5 + 1.5, // 1.5s – 3s
  }));
}
const BUBBLE_SETS: Bubble[][] = Array.from({ length: 8 }, (_, i) => makeBubbles(i + 1));

function WaterEffect({ isFilled, index, isError }: { isFilled: boolean; index: number; isError: boolean }) {
  const bubbles = BUBBLE_SETS[index % BUBBLE_SETS.length];
  return (
    <div className={styles.waterContainer}>
      <motion.div
        className={`${styles.waterFill} ${isError ? styles.waterFillError : ""}`}
        initial={{ y: "100%" }}
        animate={{ y: isFilled ? "20%" : "100%" }}
        transition={{ type: "spring", stiffness: 140, damping: 14, mass: 1 }}
      >
        <div className={`${styles.wave} ${isError ? styles.waveError : ""}`} />
        <div className={styles.bubbles}>
          {bubbles.map((b, i) => (
            <span
              key={i}
              className={styles.bubble}
              style={{
                width: `${b.size}px`,
                height: `${b.size}px`,
                left: `${b.left}%`,
                animationDelay: `${b.delay}s`,
                animationDuration: `${b.duration}s`,
              }}
            />
          ))}
        </div>
      </motion.div>
      <motion.div
        className={styles.glassReflection}
        initial={{ opacity: 0 }}
        animate={{ opacity: isFilled ? 1 : 0 }}
        transition={{ duration: 0.4 }}
      />
    </div>
  );
}

// Ukuran kotak menyesuaikan lebar (asli: 4 kotak 56×64, jarak 80px) → 6 kotak muat di ponsel 360px.
function computeLayout(width: number, n: number) {
  const gap = width < 330 ? 6 : 10;
  const boxW = Math.max(36, Math.min(56, Math.floor((width - (n - 1) * gap) / n)));
  const boxH = Math.round((boxW * 64) / 56);
  const step = boxW + gap;
  const positions = Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * step);
  return {
    boxW,
    boxH,
    radius: Math.round((boxW * 16) / 56),
    fontSize: Math.round(boxW / 2),
    positions,
    lineWidth: Math.round((n - 1) * step + 20),
  };
}

export default function OtpDesign28(props: OtpDesignProps) {
  const { length, value, onChange, status, email, message, resendPending, onResend, onChangeContact, onSuccessDone } =
    props;

  const isFull = value.length >= length;
  const running = isFull && (status === "checking" || status === "success");
  const [phase, setPhase] = useState<Phase>("idle");
  const step: Phase = running ? phase : "idle";
  const isError = status === "error";

  // --- Rantai fase asli: (penuh) 600ms → tilting 400ms → merging 400ms → dropping 1050ms → success ---
  const mergedAtRef = useRef(0);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    if (!running) {
      if (phase !== "idle") t = setTimeout(() => setPhase("idle"), 0);
    } else if (phase === "idle") {
      t = setTimeout(() => setPhase("tilting"), 600); // biarkan air kotak terakhir terisi
    } else if (phase === "tilting") {
      t = setTimeout(() => {
        mergedAtRef.current = Date.now();
        setPhase("merging");
      }, 400);
    } else if (phase === "merging" && status === "success") {
      // Saat "checking" bola hijau menunggu di sini; begitu server bilang benar, lanjut menetes.
      const remaining = Math.max(0, 400 - (Date.now() - mergedAtRef.current));
      t = setTimeout(() => setPhase("dropping"), remaining);
    } else if (phase === "dropping") {
      t = setTimeout(() => setPhase("success"), 1050); // sesuai pantulan 1,05 detik
    }
    return () => {
      if (t) clearTimeout(t);
    };
  }, [running, phase, status]);

  // --- onSuccessDone: sekali, setelah satu putaran gembok hijau + 400ms (dengan pengaman waktu) ---
  const onSuccessDoneRef = useRef(onSuccessDone);
  useEffect(() => {
    onSuccessDoneRef.current = onSuccessDone;
  }, [onSuccessDone]);
  const doneRef = useRef(false);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fireDone = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onSuccessDoneRef.current();
  }, []);
  const handleTickLoop = useCallback(() => {
    if (doneRef.current || holdTimerRef.current) return;
    holdTimerRef.current = setTimeout(fireDone, SUCCESS_HOLD_MS);
  }, [fireDone]);
  useEffect(() => {
    if (step !== "success") return;
    const t = setTimeout(fireDone, SUCCESS_SAFETY_MS);
    return () => clearTimeout(t);
  }, [step, fireDone]);
  useEffect(
    () => () => {
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    },
    [],
  );

  // --- Ukuran responsif ---
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(360);
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(Math.round(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const layout = computeLayout(width, length);

  // --- Input ---
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const locked = status === "checking" || status === "success";
  // Fokus dipindah oleh kode (setelah mengetik) → lewati pengecekan "lompat ke kotak kosong pertama" di onFocus,
  // karena nilai `value` dari induk belum ter-update pada saat itu (dulu kursor memantul kembali ke kotak 1).
  const programmaticFocus = useRef(false);
  const focusBox = useCallback(
    (i: number) => {
      const el = inputRefs.current[Math.max(0, Math.min(i, length - 1))];
      programmaticFocus.current = true;
      if (el) el.focus();
      programmaticFocus.current = false;
    },
    [length],
  );

  useEffect(() => {
    // Fokus awal & setelah induk mengosongkan kode (mis. sesudah salah).
    if (value === "" && status === "idle") focusBox(0);
  }, [value, status, focusBox]);

  // Kode terbaru langsung disimpan di ref: ketikan cepat (sebelum render ulang) tidak menimpa angka sebelumnya.
  const latest = useRef(value);
  useEffect(() => { latest.current = value; }, [value]);
  const commit = (next: string) => {
    const clean = next.replace(/\D/g, "").slice(0, length);
    if (clean !== latest.current) { latest.current = clean; onChange(clean); }
    return clean;
  };

  const handleChange = (raw: string, index: number) => {
    if (locked) return;
    const value = latest.current;
    const d = raw.replace(/\D/g, "");
    if (!d) {
      if (value[index]) commit(value.slice(0, index) + value.slice(index + 1));
      return;
    }
    let next: string;
    if (d.length >= 3) {
      // isi otomatis (one-time-code) / tempel ke satu kotak
      next = d.length >= length ? d : value.slice(0, index) + d;
    } else {
      // ambil karakter terakhir yang diketik (seperti aslinya)
      const chars = value.split("");
      chars[index] = d[d.length - 1];
      next = chars.join("");
    }
    const clean = commit(next);
    focusBox(Math.min(clean.length, length - 1));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>, index: number) => {
    if (locked) return;
    const value = latest.current;
    if (e.key === "Backspace") {
      e.preventDefault();
      if (value[index]) {
        commit(value.slice(0, index) + value.slice(index + 1));
      } else if (index > 0) {
        commit(value.slice(0, index - 1) + value.slice(index));
        focusBox(index - 1);
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      e.preventDefault();
      focusBox(index - 1);
    } else if (e.key === "ArrowRight" && index < Math.min(value.length, length - 1)) {
      e.preventDefault();
      focusBox(index + 1);
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>, index: number) => {
    e.preventDefault();
    if (locked) return;
    const d = e.clipboardData.getData("text").replace(/\D/g, "");
    if (!d) return;
    const next = d.length >= length ? d : value.slice(0, index) + d;
    const clean = commit(next);
    focusBox(Math.min(clean.length, length - 1));
  };

  const handleFocus = (el: HTMLInputElement, index: number) => {
    // Kode selalu berurutan: arahkan fokus ke kotak kosong pertama.
    if (!programmaticFocus.current && index > value.length) {
      focusBox(value.length);
      return;
    }
    el.select();
  };

  // indeks aktif untuk garis penghubung
  const activeIndex = Math.min(value.length, length);
  const spread = step === "idle" || step === "tilting";
  const gone = step === "dropping" || step === "success";
  const half = length / 2;

  const subtitleKey = step === "success" ? "verified" : "waiting";

  return (
    <div className={styles.card}>
      <div className={styles.iconWrapper}>
        <Lottie
          key={step === "success" ? "success" : "idle"}
          src={step === "success" ? LOCK_GREEN_TICK : LOCK_LOCKED}
          autoplay
          loop
          className={styles.lottieBox}
          style={{
            height: step === "success" ? "85px" : "100px",
            width: step === "success" ? "85px" : "100px",
          }}
          subscriptions={step === "success" ? { loopCompleted: handleTickLoop, complete: handleTickLoop } : undefined}
        />
      </div>

      <h1 className={styles.title}>{OTP_TEXT.title}</h1>
      <div className={styles.subtitleSlot}>
        <AnimatePresence mode="wait">
          <motion.p
            key={subtitleKey}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className={styles.subtitle}
          >
            {step === "success" ? OTP_TEXT.successSub : OTP_TEXT.subtitle(email)}
          </motion.p>
        </AnimatePresence>
      </div>

      <div className={styles.otpContainer}>
        <motion.div
          className={styles.connectorLineWrapper}
          animate={{ scaleX: spread ? 1 : 0, opacity: spread ? 1 : 0 }}
          transition={{ type: "spring", stiffness: 120, damping: 15 }}
        >
          <div
            className={styles.connectorLineBg}
            style={{ width: `${layout.lineWidth}px`, marginLeft: `${-layout.lineWidth / 2}px` }}
          >
            <div
              className={`${styles.connectorLineFill} ${isError ? styles.connectorLineFillError : ""}`}
              style={{ width: `${Math.min((activeIndex / Math.max(1, length - 1)) * 100, 100)}%` }}
            />
          </div>
        </motion.div>

        {/* Liquid Green Water Drop & Success Splash */}
        <motion.div
          initial={{ opacity: 0, scale: 0.45, y: 0 }}
          animate={
            step === "dropping"
              ? {
                  opacity: 1,
                  y: [0, -115, 12, -26, 6, -4, 0],
                  scaleX: [0.45, 0.45, 1.8, 1.0, 1.4, 1.15, 1.25],
                  scaleY: [0.45, 0.55, 0.75, 1.4, 1.1, 1.3, 1.25],
                  borderRadius: ["50%", "50% 50% 35% 35%", "45% 45% 55% 55%", "50% 50% 45% 45%", "50%", "50%", "50%"],
                }
              : step === "success"
                ? { opacity: 1, y: 0, scaleX: 1.25, scaleY: 1.25, borderRadius: "50%" }
                : { opacity: 0, scale: 0.45, y: 0 }
          }
          transition={
            step === "dropping"
              ? {
                  duration: 1.05,
                  times: [0, 0.35, 0.6, 0.75, 0.86, 0.94, 1],
                  ease: ["easeOut", "easeIn", "easeOut", "easeIn", "easeOut", "easeIn"],
                  opacity: { duration: 0.01 },
                }
              : { type: "spring", stiffness: 400, damping: 25 }
          }
          className={styles.greenWaterDrop}
          aria-hidden="true"
        >
          {/* Green Water Fill (~78% height, leaves clear top space) */}
          <div className={styles.dropWaterFill}>
            <div className={styles.dropLiquidSurface} />
            <div className={styles.dropBubbles}>
              <span className={`${styles.dropBubble} ${styles.b1}`} />
              <span className={`${styles.dropBubble} ${styles.b2}`} />
              <span className={`${styles.dropBubble} ${styles.b3}`} />
              <span className={`${styles.dropBubble} ${styles.b4}`} />
              <span className={`${styles.dropBubble} ${styles.b5}`} />
            </div>
          </div>

          {/* Clear Glass Glare on Top */}
          <div className={styles.dropGlassShine} />

          {/* Success Checkmark */}
          <AnimatePresence>
            {step === "success" && (
              <motion.div
                className={styles.checkMark}
                initial={{ scale: 0, opacity: 0, rotate: -45 }}
                animate={{ scale: [0, 1.3, 1], opacity: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 500, damping: 20, delay: 0.05 }}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth="3.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        <motion.div
          ref={wrapperRef}
          className={styles.inputsWrapper}
          style={{ height: `${layout.boxH}px` }}
          animate={isError ? { x: [0, -12, 12, -9, 9, -5, 5, 0] } : { x: 0 }}
          transition={{ duration: 0.5, ease: "easeInOut" }}
        >
          {Array.from({ length }, (_, index) => {
            const digit = value[index] ?? "";
            const isFilled = digit !== "";
            const isActive = index === activeIndex || (activeIndex === length && index === length - 1);
            const cls = [
              styles.inputBox,
              isFilled ? styles.filled : "",
              isActive && !isError ? styles.active : "",
              isError ? styles.error : "",
            ].join(" ");
            return (
              <motion.div
                key={index}
                className={cls}
                style={{
                  width: `${layout.boxW}px`,
                  height: `${layout.boxH}px`,
                  marginLeft: `${-layout.boxW / 2}px`,
                }}
                initial={{ x: layout.positions[index] }}
                animate={{
                  x: spread ? layout.positions[index] : 0,
                  rotate: step === "tilting" || step === "merging" ? (index < half ? 15 : -15) : 0,
                  scale: gone ? 0 : step === "merging" ? 0.5 : 1,
                  backgroundColor: step === "merging" ? "rgba(16, 185, 129, 1)" : "rgba(255, 255, 255, 0.1)",
                  opacity: gone ? 0 : 1,
                  borderRadius: step === "merging" ? "50%" : `${layout.radius}px`,
                }}
                transition={{
                  x: { type: "spring", stiffness: 400, damping: 35 },
                  rotate: { type: "spring", stiffness: 300, damping: 20 },
                  opacity: { duration: 0.1 },
                  scale: { duration: 0.3 },
                  backgroundColor: { duration: 0.3 },
                  borderRadius: { duration: 0.3 },
                }}
              >
                <WaterEffect isFilled={isFilled} index={index} isError={isError} />
                <motion.input
                  ref={(el: HTMLInputElement | null) => {
                    inputRefs.current[index] = el;
                  }}
                  className={styles.otpInput}
                  style={{ fontSize: `${layout.fontSize}px` }}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete={index === 0 ? "one-time-code" : "off"}
                  aria-label={`Angka ke-${index + 1} dari ${length}`}
                  value={digit}
                  readOnly={locked}
                  onChange={(e) => handleChange(e.target.value, index)}
                  onKeyDown={(e) => handleKeyDown(e, index)}
                  onPaste={(e) => handlePaste(e, index)}
                  onFocus={(e) => handleFocus(e.currentTarget, index)}
                  animate={{ opacity: spread ? 1 : 0 }}
                  transition={{ duration: 0.2 }}
                />
              </motion.div>
            );
          })}
        </motion.div>
      </div>

      <div className={styles.messageSlot} aria-live="polite">
        {message ? (
          <p className={`${styles.message} ${message.tone === "error" ? styles.messageError : ""}`}>{message.text}</p>
        ) : status === "checking" ? (
          <p className={styles.message}>{OTP_TEXT.checking}</p>
        ) : null}
      </div>

      <div className={styles.bottomSlot}>
        <AnimatePresence mode="wait">
          {step === "success" ? (
            <motion.p
              key="secure"
              className={`${styles.resend} ${styles.secureText}`}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.3 }}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              {OTP_TEXT.successTitle}
            </motion.p>
          ) : (
            <motion.div
              key="resend"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.3 }}
            >
              <p className={styles.resend}>
                {OTP_TEXT.noCode}
                <button
                  type="button"
                  className={styles.resendLink}
                  onClick={onResend}
                  disabled={!!resendPending || locked}
                >
                  {OTP_TEXT.resend}
                </button>
              </p>
              <p className={`${styles.resend} ${styles.changeContact}`}>
                <button type="button" className={styles.resendLink} onClick={onChangeContact} disabled={locked}>
                  {OTP_TEXT.changeContact}
                </button>
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
