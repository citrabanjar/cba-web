"use client";

/* ═══════════════════════════════════════════════════════
   OTP Desain 70 — Liquid Glass Morph (port codexr 70-otp-v9)
   Fase animasi berhasil: idle → (freeze) → pulse → liquid → card
   Status dari induk: checking = menunggu server; success = putar urutan penuh;
   error = getar + merah (desain asli tidak punya efek gagal).
   ═══════════════════════════════════════════════════════ */

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type FocusEvent,
  type KeyboardEvent,
} from "react";
import { motion, type Variants } from "motion/react";
import styles from "./OtpDesign70.module.css";
import { OTP_TEXT, type OtpDesignProps } from "./types";
import { playDrop, playFill, playSplash, playSuccess } from "./otp70-sounds";

type Phase = "idle" | "pulse" | "liquid" | "orb" | "card";

// Durasi fase (ms) — sama dengan TIMING asli; `card` = lamanya urutan kartu berhasil
// (isi air 0,2+1,2 s, centang 0,5+0,45 s, label 0,8 s+pegas, teks bawah 1,2 s+pegas, akor 1,74 s).
const TIMING = {
  freeze: 150,
  pulse: 380,
  liquid: 1100,
  card: 2400,
  hold: 400,
};
const OTP70_SUCCESS_TOTAL_MS =
  TIMING.freeze + TIMING.pulse + TIMING.liquid + TIMING.card + TIMING.hold; // 4430

const ORB_SIZE = 76;
const CARD = { w: 260, h: 300, r: 32 };
const DEFAULT_AVAIL = 360; // lebar isi kartu di desktop (440 − 2×40)

type Layout = {
  boxW: number;
  boxH: number;
  gap: number;
  radius: number;
  totalW: number;
  font: number;
  cardW: number;
};

// Ukuran asli: kotak 72×80, jarak 16, radius 20 untuk 4 kotak. Untuk 6 kotak diperkecil sesuai lebar.
function computeLayout(avail: number, count: number): Layout {
  const gap = avail < 300 ? 6 : avail < 340 ? 8 : 12;
  const boxW = Math.max(30, Math.min(58, Math.floor((avail - gap * (count - 1)) / count)));
  const boxH = Math.round((boxW * 80) / 72);
  const radius = Math.round(Math.min(20, boxW * 0.3));
  const font = Math.max(18, Math.min(28, Math.round(boxW * 0.5)));
  return {
    boxW,
    boxH,
    gap,
    radius,
    totalW: boxW * count + gap * (count - 1),
    font,
    cardW: Math.min(CARD.w, avail),
  };
}

const MASTER_FILL = "linear-gradient(180deg, rgba(139, 92, 246, 0.45) 0%, rgba(59, 130, 246, 0.65) 100%)";

// ═══════════════════════════════════════════════════════
//  ANIMATION VARIANTS (sama dengan asli)
// ═══════════════════════════════════════════════════════

const waterV: Variants = {
  idle: { opacity: 1 },
  pulse: { opacity: 1 },
  liquid: { opacity: 0, transition: { duration: 0.2, delay: 0.45 } },
  orb: { opacity: 0 },
  card: { opacity: 0 },
};

const masterWaterV: Variants = { idle: {}, pulse: {}, liquid: {}, orb: {}, card: {} };

const masterWaterLevelV: Variants = {
  idle: { height: "0%", opacity: 0 },
  pulse: { height: "0%", opacity: 0 },
  liquid: {
    height: "85%",
    opacity: 1,
    background: MASTER_FILL,
    transition: {
      height: { type: "spring", stiffness: 120, damping: 15, delay: 0.45 },
      opacity: { duration: 0.1, delay: 0.45 },
    },
  },
  orb: {
    height: "85%",
    opacity: 1,
    background: MASTER_FILL,
    transition: { duration: 0.4, ease: "easeInOut" },
  },
  card: {
    height: ["0%", "85%"],
    opacity: [0, 1],
    background: MASTER_FILL,
    transition: {
      height: { duration: 1.2, ease: "easeInOut", delay: 0.2 },
      opacity: { duration: 0.4, delay: 0.2 },
    },
  },
};

function morphV(l: Layout): Variants {
  return {
    idle: { width: l.totalW, height: l.boxH, borderRadius: l.radius, borderColor: "rgba(255,255,255,0)" },
    pulse: {
      width: l.totalW,
      height: l.boxH,
      borderRadius: l.radius,
      scale: 1,
      borderColor: "rgba(255,255,255,0)",
      transition: { type: "spring", stiffness: 400, damping: 12 },
    },
    liquid: {
      width: l.totalW,
      height: l.boxH,
      borderRadius: l.radius,
      scale: 1,
      borderColor: "rgba(255,255,255,0)",
      transition: { default: { type: "spring", stiffness: 200, damping: 28 } },
    },
    orb: {
      width: ORB_SIZE,
      height: ORB_SIZE,
      borderRadius: ORB_SIZE / 2,
      scale: 1,
      borderColor: "rgba(255,255,255,0.16)",
      boxShadow: "0 16px 48px -4px rgba(0,0,0,0.5), inset 0 2px 1px rgba(255,255,255,0.14)",
      transition: { type: "spring", stiffness: 120, damping: 17, mass: 1.15 },
    },
    card: {
      width: l.cardW,
      height: CARD.h,
      borderRadius: CARD.r,
      scale: 1,
      borderColor: "rgba(255,255,255,0.1)",
      boxShadow: "0 24px 64px -8px rgba(0,0,0,0.55), inset 0 1px 0px rgba(255,255,255,0.08)",
      transition: { type: "spring", stiffness: 100, damping: 20 },
    },
  };
}

const backdropV: Variants = {
  idle: { opacity: 0 },
  pulse: { opacity: 0 },
  liquid: { opacity: 1, transition: { delay: 0.45, duration: 0.22 } },
  orb: { opacity: 1 },
  card: { opacity: 1 },
};

const reflectV: Variants = {
  idle: { opacity: 0 },
  pulse: { opacity: 0 },
  liquid: { opacity: 1, transition: { delay: 0.45, duration: 0.25 } },
  orb: { opacity: 1 },
  card: { opacity: 1 },
};

function gapV(gap: number): Variants {
  return { idle: { gap }, pulse: { gap }, liquid: { gap }, orb: { gap }, card: { gap } };
}

// Asli (4 kotak): x = 24, 8, −8, −24 → setiap kotak bergeser ke tengah sehingga jaraknya tertutup.
// Rumus umum: x_i = (tengah − i) × gap.
function slotV(i: number, count: number, l: Layout): Variants {
  const center = (count - 1) / 2;
  const base = { width: l.boxW, height: l.boxH, scaleY: 1, x: 0 };
  return {
    idle: base,
    pulse: base,
    liquid: {
      ...base,
      x: (center - i) * l.gap,
      transition: { x: { duration: 0.45, ease: "easeInOut" } },
    },
    orb: base,
    card: base,
  };
}

function glassV(radius: number): Variants {
  return {
    idle: { opacity: 1, scale: 1, borderRadius: radius },
    pulse: {
      opacity: 1,
      scale: 1,
      borderRadius: radius,
      transition: { type: "spring", stiffness: 400, damping: 12 },
    },
    liquid: {
      opacity: 0,
      scale: 1,
      borderRadius: radius,
      transition: { opacity: { delay: 0.45, duration: 0.2 } },
    },
    orb: { opacity: 0 },
    card: { opacity: 0 },
  };
}

const liquidShadowV: Variants = {
  idle: { opacity: 0 },
  pulse: { opacity: 0 },
  liquid: { opacity: 1, transition: { duration: 0.4, delay: 0.45 } },
  orb: { opacity: 0, transition: { duration: 0.2 } },
  card: { opacity: 0 },
};

const digitV: Variants = {
  idle: { opacity: 1, scale: 1 },
  pulse: { opacity: 1, scale: 1.06, transition: { type: "spring", stiffness: 300, damping: 10 } },
  liquid: { opacity: 1, scale: 1 },
  orb: { opacity: 0, scale: 0.5, transition: { duration: 0.22, delay: 0.06 } },
  card: { opacity: 0, scale: 0 },
};

const successV: Variants = {
  idle: { opacity: 0, scale: 0.6, y: 15 },
  pulse: { opacity: 0, scale: 0.6, y: 15 },
  liquid: { opacity: 0, scale: 0.6, y: 15 },
  orb: { opacity: 0, scale: 0.6, y: 15 },
  card: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { delay: 0.2, type: "spring", stiffness: 100, damping: 18 },
  },
};

// ─── Inline SVG Icons ────────────────────────────────────
function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d="M14.12 14.12a3 3 0 11-4.24-4.24" />
    </svg>
  );
}

function SmartphoneIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
      <line x1="12" y1="18" x2="12.01" y2="18" />
    </svg>
  );
}

// ─── Component ───────────────────────────────────────────
export default function OtpDesign70(props: OtpDesignProps) {
  const {
    length,
    value,
    onChange,
    status,
    email,
    message,
    resendPending,
    onResend,
    onChangeContact,
    onSuccessDone,
  } = props;

  const [phase, setPhase] = useState<Phase>("idle");
  const [avail, setAvail] = useState<number>(DEFAULT_AVAIL);
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const doneRef = useRef(false);
  const onDoneRef = useRef(onSuccessDone);

  useEffect(() => {
    onDoneRef.current = onSuccessDone;
  }, [onSuccessDone]);

  // Ukur lebar isi kartu agar 6 kotak muat (termasuk ponsel 360 px).
  useEffect(() => {
    const el = stageRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setAvail(Math.round(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Fokus kotak pertama saat awal / setelah induk mengosongkan kode (mis. sesudah salah).
  useEffect(() => {
    if (status === "idle" && value === "") {
      refs.current[0]?.focus({ preventScroll: true });
    }
  }, [status, value]);

  // ── Phase State Machine (dipicu status "success") ──────
  useEffect(() => {
    if (status !== "success") return;
    const timers: number[] = [];
    const at = (ms: number, fn: () => void) => {
      timers.push(window.setTimeout(fn, ms));
    };
    const finish = () => {
      if (doneRef.current) return;
      doneRef.current = true;
      onDoneRef.current();
    };
    refs.current.forEach((r) => r?.blur());

    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (reduced) {
      at(TIMING.freeze, () => setPhase("card"));
      at(TIMING.freeze + TIMING.card + TIMING.hold, finish);
    } else {
      const tPulse = TIMING.freeze;
      const tLiquid = tPulse + TIMING.pulse;
      const tCard = tLiquid + TIMING.liquid;
      at(tPulse, () => setPhase("pulse"));
      at(tLiquid, () => {
        setPhase("liquid");
        playSplash();
      });
      at(tCard, () => {
        setPhase("card");
        playFill();
        playSuccess();
      });
      at(OTP70_SUCCESS_TOTAL_MS, finish);
    }
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      setPhase("idle");
    };
  }, [status]);

  const shownPhase: Phase = status === "success" ? phase : "idle";
  const isCard = shownPhase === "card";
  const locked = status !== "idle";
  const isError = status === "error";
  const layout = computeLayout(avail, length);

  const digits = Array.from({ length }, (_, i) => value[i] ?? "");

  function focusBox(i: number) {
    const idx = Math.max(0, Math.min(length - 1, i));
    refs.current[idx]?.focus();
  }

  // ── Input Handlers ─────────────────────────────────────
  function commit(next: string) {
    const clean = next.replace(/\D/g, "").slice(0, length);
    onChange(clean);
    if (clean.length >= length) {
      refs.current.forEach((r) => r?.blur());
    } else {
      focusBox(clean.length);
    }
  }

  function handleChange(i: number, e: ChangeEvent<HTMLInputElement>) {
    if (locked) return;
    const raw = e.target.value.replace(/\D/g, "");
    if (raw === "") {
      onChange(value.slice(0, i) + value.slice(i + 1));
      return;
    }
    const current = digits[i];
    let incoming = raw;
    // Kotak sudah berisi lalu diketik angka baru → ambil angka baru saja.
    if (current && raw.length === 2) incoming = raw.replace(current, "") || raw.slice(-1);

    let next: string;
    if (incoming.length === 1) {
      next = i < value.length ? value.slice(0, i) + incoming + value.slice(i + 1) : value + incoming;
    } else {
      // Isi otomatis (one-time-code) / beberapa angka sekaligus.
      next = value.slice(0, Math.min(i, value.length)) + incoming;
    }
    playDrop();
    commit(next);
  }

  function handleKeyDown(i: number, e: KeyboardEvent<HTMLInputElement>) {
    if (locked) return;
    if (e.key === "Backspace" && !digits[i] && i > 0) {
      e.preventDefault();
      onChange(value.slice(0, i - 1));
      focusBox(i - 1);
    } else if (e.key === "ArrowLeft" && i > 0) {
      e.preventDefault();
      focusBox(i - 1);
    } else if (e.key === "ArrowRight" && i < value.length) {
      e.preventDefault();
      focusBox(i + 1);
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    if (locked) return;
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (!pasted) return;
    playDrop();
    commit(pasted);
  }

  function handleFocus(i: number, e: FocusEvent<HTMLInputElement>) {
    // Jangan biarkan celah: fokus selalu ke kotak kosong pertama.
    if (i > value.length) {
      focusBox(value.length);
      return;
    }
    e.target.select();
  }

  const subtitle = OTP_TEXT.subtitle(email);
  const emailAt = email ? subtitle.indexOf(email) : -1;

  const messageText = message?.text ?? (status === "checking" ? OTP_TEXT.checking : "");
  const messageIsError = message?.tone === "error" || (isError && !message);

  // ═══════════════════════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════════════════════
  return (
    <motion.div className={styles.card}>
      <div className={styles.ambient} aria-hidden="true" />

      {/* ── Header ─────────────────────────── */}
      <motion.div
        className={styles.header}
        animate={{
          opacity: isCard ? 0 : 1,
          y: isCard ? -6 : 0,
          height: isCard ? 0 : "auto",
          marginBottom: isCard ? 0 : 32,
        }}
        style={{ overflow: "hidden" }}
        transition={{ duration: 0.35 }}
      >
        <div className={styles.headerIcon}>
          <SmartphoneIcon />
        </div>
        <h2 className={styles.headerTitle}>{OTP_TEXT.title}</h2>
        <p className={styles.headerSubtitle}>
          {emailAt >= 0 ? (
            <>
              {subtitle.slice(0, emailAt)}
              <span className={styles.headerPhone}>{email}</span>
              {subtitle.slice(emailAt + email.length)}
            </>
          ) : (
            subtitle
          )}
        </p>
      </motion.div>

      {/* ── Animation Stage ────────────────── */}
      <div className={styles.stage} ref={stageRef}>
        <motion.div
          className={styles.shake}
          animate={isError ? { x: [0, -10, 10, -8, 8, -4, 4, 0] } : { x: 0 }}
          transition={{ duration: 0.45, ease: "easeInOut" }}
        >
          <motion.div
            className={`${styles.glassMorph}${isError ? ` ${styles.isError}` : ""}`}
            variants={morphV(layout)}
            initial="idle"
            animate={shownPhase}
            style={{ borderWidth: 1, borderStyle: "solid" }}
          >
            <motion.div className={styles.glassMorphBackdrop} variants={backdropV} initial="idle" animate={shownPhase} />

            {/* Dedicated static shadow layer to avoid repaint lag during merge */}
            <motion.div className={styles.liquidShadow} variants={liquidShadowV} initial="idle" animate={shownPhase} />

            {/* Master Water (rises on merge) */}
            <motion.div className={styles.masterWaterContainer} variants={masterWaterV} initial="idle" animate={shownPhase}>
              <motion.div className={styles.masterWaterLevel} variants={masterWaterLevelV}>
                <div className={styles.masterWaterWaveBack} />
                <div className={styles.masterWaterWave} />
                <div className={`${styles.bubble} ${styles.b1}`} />
                <div className={`${styles.bubble} ${styles.b2}`} />
                <div className={`${styles.bubble} ${styles.b3}`} />
                <div className={`${styles.bubble} ${styles.b4}`} />
              </motion.div>
            </motion.div>

            <motion.div className={styles.glassMorphReflection} variants={reflectV} initial="idle" animate={shownPhase} />

            {/* OTP Input Slots */}
            <motion.div
              className={styles.slots}
              variants={gapV(layout.gap)}
              initial="idle"
              animate={shownPhase}
              role="group"
              aria-label="Kode OTP"
            >
              {digits.map((digit, i) => (
                <motion.div
                  key={i}
                  className={styles.slot}
                  variants={slotV(i, length, layout)}
                  initial="idle"
                  animate={shownPhase}
                >
                  <motion.div className={styles.slotGlass} variants={glassV(layout.radius)} initial="idle" animate={shownPhase} />

                  {/* Water Fill Animation */}
                  <motion.div
                    className={styles.waterContainer}
                    style={{ borderRadius: Math.max(4, layout.radius - 2) }}
                    variants={waterV}
                    initial="idle"
                    animate={shownPhase}
                  >
                    <motion.div
                      className={styles.waterLevel}
                      initial={{ height: "0%" }}
                      animate={{ height: digit ? "85%" : "0%" }}
                      transition={{ type: "spring", stiffness: 140, damping: 14 }}
                    >
                      <div className={styles.waterWaveBack} />
                      <div className={styles.waterWave} />
                      <div className={`${styles.bubble} ${styles.b1}`} />
                      <div className={`${styles.bubble} ${styles.b2}`} />
                      <div className={`${styles.bubble} ${styles.b3}`} />
                      <div className={`${styles.bubble} ${styles.b4}`} />
                    </motion.div>
                  </motion.div>

                  <motion.input
                    ref={(el: HTMLInputElement | null) => {
                      refs.current[i] = el;
                    }}
                    className={styles.input}
                    style={{ fontSize: layout.font }}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete={i === 0 ? "one-time-code" : "off"}
                    value={digit}
                    onChange={(e) => handleChange(i, e)}
                    onKeyDown={(e) => handleKeyDown(i, e)}
                    onPaste={handlePaste}
                    onFocus={(e) => handleFocus(i, e)}
                    readOnly={locked}
                    aria-label={`Angka ${i + 1} dari ${length}`}
                    aria-invalid={isError || undefined}
                    variants={digitV}
                  />
                </motion.div>
              ))}
            </motion.div>

            {/* Success Overlay */}
            <motion.div className={styles.successOverlay} variants={successV} initial="idle" animate={shownPhase}>
              <div className={styles.successIcon}>
                <motion.svg
                  viewBox="0 0 24 24"
                  className={styles.successCheck}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <motion.path
                    d="M5 13l4 4L19 7"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: isCard ? 1 : 0 }}
                    transition={{ delay: 0.5, duration: 0.45, ease: "easeOut" }}
                  />
                </motion.svg>
              </div>
              <motion.p
                className={styles.successLabel}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: isCard ? 1 : 0, y: isCard ? 0 : 8 }}
                transition={{ delay: 0.8, type: "spring", stiffness: 100, damping: 18 }}
              >
                {OTP_TEXT.successTitle}
              </motion.p>
            </motion.div>
          </motion.div>
        </motion.div>

        {/* Pesan dari server / status memeriksa */}
        {!isCard && (
          <p
            className={`${styles.message}${messageIsError ? ` ${styles.messageError}` : ""}`}
            role={messageIsError ? "alert" : "status"}
            aria-live="polite"
          >
            {messageText}
          </p>
        )}

        {/* Success Message (after success) */}
        {isCard && (
          <motion.p
            className={styles.successSub}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.2, type: "spring", stiffness: 100, damping: 18 }}
            role="status"
          >
            {OTP_TEXT.successSub}
          </motion.p>
        )}
      </div>

      {/* ── Footer: Resend OTP ──────────────── */}
      <motion.div
        className={styles.footer}
        animate={{
          opacity: isCard ? 0 : 1,
          y: isCard ? 6 : 0,
          height: isCard ? 0 : "auto",
          marginTop: isCard ? 0 : 20,
        }}
        style={{ overflow: "hidden" }}
        transition={{ duration: 0.35 }}
      >
        <button
          type="button"
          className={styles.footerResend}
          onClick={onResend}
          disabled={Boolean(resendPending) || status === "success"}
        >
          {OTP_TEXT.noCode} <span className={styles.footerResendHighlight}>{OTP_TEXT.resend}</span>
        </button>
        <button
          type="button"
          className={styles.footerTimer}
          onClick={onChangeContact}
          disabled={status === "success"}
        >
          {OTP_TEXT.changeContact}
        </button>
      </motion.div>

      {/* ── Divider ─────────────────────────── */}
      <motion.div className={styles.divider} animate={{ opacity: isCard ? 0 : 1 }} transition={{ duration: 0.3 }} />

      {/* ── Security / Privacy Icons ────────── */}
      <motion.div className={styles.security} animate={{ opacity: isCard ? 0 : 1 }} transition={{ duration: 0.35 }}>
        <div className={styles.securityItem}>
          <LockIcon />
          <span>Terenkripsi</span>
        </div>
        <div className={styles.securityItem}>
          <ShieldIcon />
          <span>Aman</span>
        </div>
        <div className={styles.securityItem}>
          <EyeOffIcon />
          <span>Privat</span>
        </div>
      </motion.div>
    </motion.div>
  );
}
