"use client";

// Desain OTP 67 — "Glassy OTP Animation" (galeri codexr), diport seutuhnya:
// kartu kaca bersudut terpotong, chip kaca melayang, border emas, dan animasi berhasil asli
// (kotak menyebar ke orbit lingkaran putus-putus, berputar 360°, menyatu ke tengah, cincin conic
// merah→hijau, ripple, partikel, centang tergambar, glow berdenyut, kilau kaca).
// Kotak dihitung dari props.length (6); posisi orbit dihitung dari tata letak nyata.

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";
import { motion, AnimatePresence, animate, type AnimationPlaybackControls, type Variants } from "motion/react";
import { ShieldCheck, ArrowRight, RotateCcw, KeyRound, Mail } from "lucide-react";
import { Plus_Jakarta_Sans, Space_Grotesk } from "next/font/google";
import { OTP_TEXT, type OtpDesignProps } from "./types";
import styles from "./OtpDesign67.module.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--otp67-jakarta",
  display: "swap",
});
const grotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--otp67-grotesk",
  display: "swap",
});

// Durasi asli (detik / ms)
const ORBIT_DURATION = 2.5; // sebar → putar → menyatu
const ORBIT_TIMES = [0, 0.2, 0.8, 1];
const ORBIT_RADIUS = 72;
const VERIFIED_TEXT_MS = 2600; // judul berganti "Kode benar!"
// Asli memanggil onVerify di 3300 ms (ripple selesai 3,3 s). Ditambah agar keadaan akhir
// (centang, glow berdenyut mulai 3,0 s, sapuan kilau pertama 3,5–4,25 s) sempat terlihat.
const SUCCESS_DONE_MS = 4300;

// Sudut terpotong kartu, dibangun dari ukuran nyata (asli: 580×530, potongan 110).
function buildCardPath(w: number, h: number, c: number): string {
  const r = 30;
  const k = 8.3;
  const d = 5.9;
  const f = (n: number) => Number(n.toFixed(1));
  return [
    `M ${f(c + k)} 0`,
    `L ${f(w - r)} 0`,
    `A ${r} ${r} 0 0 1 ${f(w)} ${r}`,
    `L ${f(w)} ${f(h - c - k)}`,
    `Q ${f(w)} ${f(h - c)} ${f(w - d)} ${f(h - c + d)}`,
    `L ${f(w - c + d)} ${f(h - d)}`,
    `Q ${f(w - c)} ${f(h)} ${f(w - c - k)} ${f(h)}`,
    `L ${r} ${f(h)}`,
    `A ${r} ${r} 0 0 1 0 ${f(h - r)}`,
    `L 0 ${f(c + k)}`,
    `Q 0 ${f(c)} ${d} ${f(c - d)}`,
    `L ${f(c - d)} ${d}`,
    `Q ${f(c)} 0 ${f(c + k)} 0`,
    "Z",
  ].join(" ");
}

// Chip satelit (88×88) asli
const CHIP_PATH =
  "M 22 0 L 72 0 Q 88 0 84.0 11.2 L 11.2 84.0 Q 0 88 0 72 L 0 22 A 22 22 0 0 1 22 0 Z";

const containerVariants: Variants = {
  idle: { rotate: 0 },
  success: {
    rotate: [0, 0, 360, 360],
    transition: { duration: ORBIT_DURATION, times: ORBIT_TIMES, ease: "easeInOut" },
  },
};

const dashedCircleVariants: Variants = {
  idle: { opacity: 0, scale: 0.5 },
  success: {
    opacity: [0, 1, 1, 0],
    scale: [0.5, 1, 1, 0.5],
    transition: { duration: ORBIT_DURATION, times: ORBIT_TIMES, ease: "easeInOut" },
  },
};

const rippleVariants: Variants = {
  idle: { opacity: 0, scale: 0.5 },
  success: {
    opacity: [0, 1, 0],
    scale: [0.5, 2.5, 4.5],
    transition: { delay: 2.5, duration: 0.8, ease: "easeOut" },
  },
};

const textVariants: Variants = {
  idle: { color: "#ffffff" },
  success: {
    color: "rgba(255, 255, 255, 0)",
    transition: { delay: 2.3, duration: 0.2 },
  },
};

const tickContainerVariants: Variants = {
  idle: { opacity: 0, scale: 0.5, x: "-50%", y: "-50%" },
  success: {
    opacity: 1,
    scale: 1,
    x: "-50%",
    y: "-50%",
    transition: { delay: 2.6, duration: 0.5, type: "spring", stiffness: 250, damping: 20 },
  },
};

const tickPathVariants: Variants = {
  idle: { pathLength: 0 },
  success: {
    pathLength: 1,
    transition: { delay: 2.8, duration: 0.4, ease: "easeOut" },
  },
};

const PARTICLES = Array.from({ length: 8 }, (_, i) => {
  const angle = (i / 8) * Math.PI * 2;
  return { x: Math.cos(angle) * 75, y: Math.sin(angle) * 75 };
});

type CardSize = { w: number; h: number };

export default function OtpDesign67(props: OtpDesignProps) {
  const { length: n, value, onChange, status, email, message, resendPending, onResend, onChangeContact, onSuccessDone } =
    props;

  const rawId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const cardClipId = `otp67-card-${rawId}`;
  const chipClipId = `otp67-chip-${rawId}`;
  const cardGradId = `otp67-cardgrad-${rawId}`;
  const chipGradId = `otp67-chipgrad-${rawId}`;

  const cardRef = useRef<HTMLDivElement>(null);
  const boxesRef = useRef<HTMLDivElement>(null);
  const slotRefs = useRef<(HTMLDivElement | null)[]>([]);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const successDoneRef = useRef(onSuccessDone);
  const successFiredRef = useRef(false);

  const [size, setSize] = useState<CardSize>({ w: 408, h: 540 });

  // "Verified" (judul hijau) muncul 2,6 s setelah sukses; direset saat status keluar dari success.
  const [verified, setVerified] = useState(false);
  const [prevStatus, setPrevStatus] = useState(status);
  if (prevStatus !== status) {
    setPrevStatus(status);
    if (status !== "success") setVerified(false);
  }

  const phase = status === "success" ? "success" : "idle";
  const isSuccess = status === "success";
  const showVerifiedText = isSuccess && verified;
  const locked = status !== "idle";
  const digits = Array.from({ length: n }, (_, i) => value[i] ?? "");
  const isComplete = value.length >= n;

  // Ukuran kartu → path kaca & chip menyesuaikan (asli memakai ukuran tetap 580×530).
  const chamfer = size.w >= 400 ? 110 : 88;
  const chipSize = chamfer - 22;
  const chipScale = chipSize / 88;
  const cardPath = buildCardPath(size.w, size.h, chamfer);

  useEffect(() => {
    successDoneRef.current = onSuccessDone;
  });

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      const w = Math.round(rect.width);
      const h = Math.round(rect.height);
      setSize((s) => (s.w === w && s.h === h ? s : { w, h }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Fokus kotak pertama saat awal dan setiap kali induk mengosongkan kode.
  useEffect(() => {
    if (status === "idle" && value === "") inputRefs.current[0]?.focus();
  }, [status, value]);

  // Kode lengkap → lepaskan fokus (asli: blur semua input saat 4 angka terisi).
  useEffect(() => {
    if (status === "checking" || status === "success") {
      inputRefs.current.forEach((el) => el?.blur());
    }
  }, [status]);

  // Teks "Kode benar!" pada 2,6 s.
  useEffect(() => {
    if (status !== "success") return;
    const t = window.setTimeout(() => setVerified(true), VERIFIED_TEXT_MS);
    return () => window.clearTimeout(t);
  }, [status]);

  // onSuccessDone sekali setelah seluruh animasi berhasil selesai.
  useEffect(() => {
    if (status !== "success") {
      successFiredRef.current = false;
      return;
    }
    const t = window.setTimeout(() => {
      if (successFiredRef.current) return;
      successFiredRef.current = true;
      successDoneRef.current();
    }, SUCCESS_DONE_MS);
    return () => window.clearTimeout(t);
  }, [status]);

  // Koreografi kotak asli: sebar ke orbit (0–0,5 s), ikut berputar, lalu menyatu ke tengah (2–2,5 s);
  // kotak selain kotak pertama menghilang di akhir. Posisi awal diukur dari tata letak nyata.
  useEffect(() => {
    const container = boxesRef.current;
    if (!container) return;
    const slots = slotRefs.current.slice(0, n).filter((el): el is HTMLDivElement => el !== null);
    const controls: AnimationPlaybackControls[] = [];

    if (status === "success") {
      const midX = container.clientWidth / 2;
      const midY = container.clientHeight / 2;
      slots.forEach((el, i) => {
        const ix = el.offsetLeft + el.offsetWidth / 2 - midX;
        const iy = el.offsetTop + el.offsetHeight / 2 - midY;
        const angle = -Math.PI / 2 + (i / n) * Math.PI * 2;
        const dx = ORBIT_RADIUS * Math.cos(angle) - ix;
        const dy = ORBIT_RADIUS * Math.sin(angle) - iy;
        el.style.zIndex = String(i === 0 ? n : n - 1 - i);
        controls.push(
          animate(
            el,
            { x: [0, dx, dx, -ix], y: [0, dy, dy, -iy], scale: [1, 1, 1, 1] },
            { duration: ORBIT_DURATION, times: ORBIT_TIMES, ease: "easeInOut" },
          ),
        );
        if (i > 0) {
          controls.push(
            animate(el, { opacity: [1, 1, 1, 0] }, { duration: ORBIT_DURATION, times: [0, 0.2, 0.99, 1], ease: "linear" }),
          );
        }
      });
    } else {
      slots.forEach((el) => {
        el.style.zIndex = "";
        controls.push(animate(el, { x: 0, y: 0, rotate: 0, scale: 1, opacity: 1 }, { duration: 0.3, ease: "easeInOut" }));
      });
    }
    return () => controls.forEach((c) => c.stop());
  }, [status, n]);

  const focusAt = (i: number) => {
    inputRefs.current[Math.max(0, Math.min(n - 1, i))]?.focus();
  };

  const handleChange = (index: number, e: ChangeEvent<HTMLInputElement>) => {
    if (locked) return;
    const cleaned = e.target.value.replace(/\D/g, "");
    if (!cleaned) {
      onChange(value.slice(0, index) + value.slice(index + 1));
      return;
    }
    let incoming = cleaned;
    const current = digits[index];
    if (current && cleaned.length === 2) {
      incoming = cleaned.startsWith(current) ? cleaned.slice(1) : cleaned.slice(0, 1);
    }
    const start = Math.min(index, value.length);
    const next = (value.slice(0, start) + incoming + value.slice(start + incoming.length)).slice(0, n);
    onChange(next);
    focusAt(start + incoming.length);
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (locked) return;
    if (e.key === "Backspace") {
      e.preventDefault();
      if (digits[index]) {
        onChange(value.slice(0, index) + value.slice(index + 1));
      } else if (index > 0) {
        onChange(value.slice(0, index - 1) + value.slice(index));
        focusAt(index - 1);
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      e.preventDefault();
      focusAt(index - 1);
    } else if (e.key === "ArrowRight" && index < n - 1) {
      e.preventDefault();
      focusAt(index + 1);
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLDivElement>) => {
    if (locked) return;
    e.preventDefault();
    const numeric = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, n);
    if (!numeric) return;
    onChange(numeric);
    focusAt(Math.min(numeric.length, n - 1));
  };

  const handleFocus = (index: number) => {
    // Kode disimpan berurutan: arahkan ke kotak kosong pertama bila mengetuk lebih jauh.
    if (!locked && index > value.length) focusAt(value.length);
  };

  const titleWords = OTP_TEXT.title.split(" ");
  const titleHead = titleWords.slice(0, -1).join(" ");
  const titleTail = titleWords[titleWords.length - 1];
  const successWords = OTP_TEXT.successTitle.split(" ");
  const successHead = successWords[0];
  const successTail = successWords.slice(1).join(" ");

  return (
    <div className={`${styles.root} ${jakarta.variable} ${grotesk.variable}`}>
      {/* Definisi SVG: clip path sudut terpotong & gradien border emas/perak */}
      <svg className={styles.svgDefs} width="0" height="0" aria-hidden="true">
        <defs>
          <clipPath id={cardClipId} clipPathUnits="userSpaceOnUse">
            <path d={cardPath} />
          </clipPath>
          <clipPath id={chipClipId} clipPathUnits="userSpaceOnUse">
            <path d={CHIP_PATH} transform={`scale(${chipScale})`} />
          </clipPath>
          <linearGradient id={cardGradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.75" />
            <stop offset="15%" stopColor="#f3d790" stopOpacity="0.55" />
            <stop offset="42%" stopColor="#ffffff" stopOpacity="0.25" />
            <stop offset="70%" stopColor="#e5b850" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0.5" />
          </linearGradient>
          <linearGradient id={chipGradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.8" />
            <stop offset="50%" stopColor="#f0ca7b" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0.3" />
          </linearGradient>
        </defs>
      </svg>

      <div className={styles.stage}>
        {/* Chip kaca melayang: kiri atas */}
        <div className={`${styles.chipContainer} ${styles.chipTl}`} style={{ width: chipSize, height: chipSize }}>
          <div className={`${styles.chipInnerFloater} ${styles.floatTl}`}>
            <div className={styles.chipBlurPanel} style={{ clipPath: `url(#${chipClipId})` }} />
            <svg className={styles.chipSvgBorder} viewBox="0 0 88 88" fill="none" aria-hidden="true">
              <path d={CHIP_PATH} stroke={`url(#${chipGradId})`} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
            </svg>
          </div>
        </div>

        {/* Chip kaca melayang: kanan bawah */}
        <div className={`${styles.chipContainer} ${styles.chipBr}`} style={{ width: chipSize, height: chipSize }}>
          <div className={`${styles.chipInnerFloater} ${styles.floatBr}`}>
            <div
              className={styles.chipBlurPanel}
              style={{
                clipPath: `url(#${chipClipId})`,
                transform: "rotate(180deg)",
                transformOrigin: `${chipSize / 2}px ${chipSize / 2}px`,
              }}
            />
            <svg className={styles.chipSvgBorder} viewBox="0 0 88 88" fill="none" aria-hidden="true">
              <g transform="rotate(180 44 44)">
                <path d={CHIP_PATH} stroke={`url(#${chipGradId})`} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
              </g>
            </svg>
          </div>
        </div>

        {/* Kartu kaca utama */}
        <motion.div
          ref={cardRef}
          className={`${styles.card} ${isSuccess ? styles.isComplete : ""}`}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className={styles.glassBlurPanel} style={{ clipPath: `url(#${cardClipId})` }} />
          <div className={styles.glassSurfaceOverlay} style={{ clipPath: `url(#${cardClipId})` }} />
          <svg
            className={styles.cardSvgBorder}
            viewBox={`0 0 ${size.w} ${size.h}`}
            preserveAspectRatio="none"
            fill="none"
            aria-hidden="true"
          >
            <path d={cardPath} stroke={`url(#${cardGradId})`} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          </svg>

          <div className={styles.cardContent}>
            {/* Header */}
            <div className={styles.cardHeader}>
              <div className={`${styles.shieldBadge} ${showVerifiedText ? styles.isVerified : ""}`}>
                {showVerifiedText ? (
                  <ShieldCheck size={24} strokeWidth={2.4} color="#22c55e" />
                ) : (
                  <KeyRound size={22} strokeWidth={2.2} />
                )}
              </div>

              <AnimatePresence mode="wait">
                <motion.div
                  key={showVerifiedText ? "verified" : "unverified"}
                  className={styles.headerText}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.3, ease: "easeInOut" }}
                >
                  <h1 className={styles.title}>
                    {showVerifiedText ? (
                      <>
                        <span className={styles.titleWhite}>{successHead}</span>{" "}
                        <span className={styles.titleGreen}>{successTail}</span>
                      </>
                    ) : (
                      <>
                        <span className={styles.titleWhite}>{titleHead}</span>{" "}
                        <span className={styles.titleLime}>{titleTail}</span>
                      </>
                    )}
                  </h1>
                  <p className={styles.subtitle}>
                    {showVerifiedText ? OTP_TEXT.successSub : OTP_TEXT.subtitle(email)}
                  </p>
                </motion.div>
              </AnimatePresence>

              {!showVerifiedText && (
                <button
                  type="button"
                  className={styles.recipientTag}
                  onClick={onChangeContact}
                  disabled={isSuccess}
                >
                  <Mail size={13} />
                  <span>{OTP_TEXT.changeContact}</span>
                </button>
              )}
            </div>

            {/* Kotak OTP pada orbit */}
            <form
              className={styles.otpForm}
              onSubmit={(e) => e.preventDefault()}
              noValidate
            >
              <div className={styles.orbitStage}>
                <motion.div
                  ref={boxesRef}
                  className={`${styles.boxesContainer} ${status === "error" ? styles.hasError : ""}`}
                  style={{ ["--n" as string]: n }}
                  onPaste={handlePaste}
                  variants={containerVariants}
                  initial="idle"
                  animate={phase}
                >
                  {/* Orbit lingkaran putus-putus (r=72) */}
                  <motion.svg
                    viewBox="0 0 160 160"
                    style={{
                      position: "absolute",
                      width: 144,
                      height: 144,
                      top: "50%",
                      left: "50%",
                      x: "-50%",
                      y: "-50%",
                      zIndex: 0,
                      pointerEvents: "none",
                    }}
                    variants={dashedCircleVariants}
                    initial="idle"
                    animate={phase}
                    aria-hidden="true"
                  >
                    <circle
                      cx="80"
                      cy="80"
                      r="72"
                      fill="none"
                      stroke="rgba(255, 255, 255, 0.35)"
                      strokeWidth="1.2"
                      strokeDasharray="4 8"
                    />
                  </motion.svg>

                  {/* Ledakan partikel */}
                  <AnimatePresence>
                    {isSuccess &&
                      PARTICLES.map((p, i) => (
                        <motion.div
                          key={`particle-${i}`}
                          style={{
                            position: "absolute",
                            width: "3.5px",
                            height: "3.5px",
                            borderRadius: "50%",
                            backgroundColor: "#22c55e",
                            top: "50%",
                            left: "50%",
                            zIndex: 2,
                            boxShadow: "0 0 8px 1px #22c55e",
                            pointerEvents: "none",
                          }}
                          initial={{ x: 0, y: 0, scale: 0, opacity: 0 }}
                          animate={{ x: p.x, y: p.y, scale: [0, 1, 0], opacity: [0, 1, 0] }}
                          transition={{ delay: 2.5, duration: 0.7, ease: "easeOut" }}
                        />
                      ))}
                  </AnimatePresence>

                  {/* Ripple sukses */}
                  <motion.div
                    style={{
                      position: "absolute",
                      width: 80,
                      height: 80,
                      top: "50%",
                      left: "50%",
                      x: "-50%",
                      y: "-50%",
                      borderRadius: "50%",
                      border: "1.5px solid #22c55e",
                      boxShadow: "0 0 16px rgba(34, 197, 94, 0.45)",
                      zIndex: 1,
                      pointerEvents: "none",
                    }}
                    variants={rippleVariants}
                    initial="idle"
                    animate={phase}
                  />

                  {digits.map((digit, index) => (
                    <div
                      key={index}
                      ref={(el) => {
                        slotRefs.current[index] = el;
                      }}
                      className={`${styles.slot} ${index === 0 ? styles.slotFirst : ""} ${digit ? styles.isFilled : ""}`}
                    >
                      <motion.input
                        ref={(el: HTMLInputElement | null) => {
                          inputRefs.current[index] = el;
                        }}
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        autoComplete="one-time-code"
                        value={digit}
                        className={styles.inputField}
                        onChange={(e) => handleChange(index, e)}
                        onKeyDown={(e) => handleKeyDown(index, e)}
                        onFocus={() => handleFocus(index)}
                        readOnly={locked}
                        variants={textVariants}
                        initial="idle"
                        animate={phase}
                        aria-label={`Angka ${index + 1}`}
                      />

                      {/* Centang di kotak tengah (kotak pertama) */}
                      {index === 0 && (
                        <motion.svg
                          viewBox="0 0 24 24"
                          fill="none"
                          className={styles.finalTick}
                          variants={tickContainerVariants}
                          initial="idle"
                          animate={phase}
                          aria-hidden="true"
                        >
                          <motion.path
                            d="M5 13l4 4L19 7"
                            stroke="#ffffff"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            variants={tickPathVariants}
                          />
                        </motion.svg>
                      )}
                    </div>
                  ))}
                </motion.div>
              </div>

              {message && !isSuccess && (
                <p className={message.tone === "error" ? styles.errorText : styles.infoText} role="status">
                  {message.text}
                </p>
              )}
            </form>

            {/* Kirim ulang */}
            <div className={styles.resendRow}>
              <span>{OTP_TEXT.noCode}</span>
              <button
                type="button"
                className={styles.resendBtn}
                onClick={onResend}
                disabled={Boolean(resendPending) || isSuccess}
              >
                {resendPending ? <span className={styles.spinnerSmall} /> : <RotateCcw size={13} />}
                <span>{OTP_TEXT.resend}</span>
              </button>
            </div>

            {/* Tombol status (asli: Verify & Proceed → Verifying… → Verified & Secured) */}
            <div className={styles.actionGroup}>
              <button
                type="button"
                className={`${styles.submitBtn} ${showVerifiedText ? styles.isVerifiedBtn : ""}`}
                disabled={!isComplete || locked}
                onClick={() => onChange(value)}
              >
                {status === "checking" || isSuccess ? (
                  showVerifiedText ? (
                    <>
                      <ShieldCheck size={19} />
                      <span>Terverifikasi</span>
                    </>
                  ) : (
                    <>
                      <div className={styles.spinner} />
                      <span>{OTP_TEXT.checking}</span>
                    </>
                  )
                ) : (
                  <>
                    <span>Verifikasi</span>
                    <ArrowRight size={18} />
                  </>
                )}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
