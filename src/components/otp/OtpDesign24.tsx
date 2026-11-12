"use client";

// Port desain codexr "24-animated-otp-verification-v7".
// Kotak-kotak bergerak ke formasi persegi panjang (garis titik-titik tergambar), lalu menyatu ke tengah,
// kotak pertama memperlihatkan centang, gelombang kejut + 40 konfeti, bingkai berubah hijau, berdenyut & berkilau.

import { useEffect, useRef, useState } from "react";
import type { ClipboardEvent, ChangeEvent, KeyboardEvent } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import type { Variants } from "motion/react";
import { Lock } from "lucide-react";
import { OTP_TEXT, type OtpDesignProps } from "./types";
import styles from "./OtpDesign24.module.css";

// Durasi asli: gerak kotak 2,1 dtk; konfeti mulai 2,1 dtk dan paling lama 1,6 dtk (selesai 3,7 dtk);
// kilau kaca pertama 3,5–4,25 dtk. Ditambah jeda agar keadaan akhir terlihat.
const MOVE_DURATION = 2.1;
const SUCCESS_TOTAL_MS = 4300;

type Geometry = { size: number; gap: number };
type BoxCustom = { i: number; n: number; geom: Geometry };

const DEFAULT_GEOM: Geometry = { size: 52, gap: 8 };

function computeGeometry(width: number, n: number): Geometry {
  const gap = width < 320 ? 6 : width < 400 ? 8 : 16;
  const size = Math.max(32, Math.min(64, Math.floor((width - gap * (n - 1)) / n)));
  return { size, gap };
}

// Formasi: kotak genap di atas, ganjil di bawah, kolom = floor(i/2) (sama seperti 2×2 asli, diperluas ke 2×3).
function formation(i: number, n: number, size: number) {
  const cols = Math.ceil(n / 2);
  const spacing = size * 1.875; // asli: 120 px antar kolom untuk kotak 64 px
  const halfY = size * 0.75; // asli: ±48 px untuk kotak 64 px
  const col = Math.floor(i / 2);
  return {
    x: (col - (cols - 1) / 2) * spacing,
    y: i % 2 === 0 ? -halfY : halfY,
    halfX: ((cols - 1) / 2) * spacing,
    halfY,
  };
}

const boxVariants: Variants = {
  idle: {
    x: 0,
    y: 0,
    rotate: 0,
    scale: 1,
    opacity: 1,
    transition: { duration: 0.3, ease: "easeInOut" },
  },
  error: {
    x: 0,
    y: 0,
    rotate: 0,
    scale: 1,
    opacity: 1,
    transition: { duration: 0.3, ease: "easeInOut" },
  },
  success: (c: BoxCustom) => {
    const { i, n, geom } = c;
    const initialX = (i - (n - 1) / 2) * (geom.size + geom.gap);
    const target = formation(i, n, geom.size);
    const deltaXCenter = target.x - initialX;
    const deltaYCenter = target.y;
    return {
      x: [0, deltaXCenter, deltaXCenter, -initialX],
      y: [0, deltaYCenter, deltaYCenter, 0],
      scale: [1, 1, 1, 1],
      opacity: [1, 1, 1, 1],
      zIndex: n - i,
      transition: {
        duration: MOVE_DURATION,
        times: [0, 0.19, 0.86, 1],
        ease: "easeInOut",
      },
    };
  },
};

const containerVariants: Variants = {
  idle: { rotate: 0, x: 0 },
  success: {
    rotate: 0,
    x: 0,
    transition: { duration: MOVE_DURATION },
  },
  error: {
    rotate: 0,
    x: [0, -12, 12, -9, 9, -5, 5, 0],
    transition: { duration: 0.5, ease: "easeInOut" },
  },
};

const CONFETTI_COLORS = ["#22c55e", "#4ade80", "#16a34a"];
const CONFETTI = Array.from({ length: 40 }, (_, i) => {
  const angle = i * 137.5 * (Math.PI / 180);
  const distance = 100 + (i % 5) * 50;
  const size = 6 + (i % 3) * 4;
  const isCircle = i % 2 === 0;
  return {
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    size,
    isCircle,
    x: Math.cos(angle) * distance,
    y: Math.sin(angle) * distance + distance * 0.2,
    duration: 1.2 + (i % 3) * 0.2,
  };
});

export default function OtpDesign24(props: OtpDesignProps) {
  const { length, value, onChange, status, email, message, resendPending, onResend, onChangeContact } = props;

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const inputsRowRef = useRef<HTMLDivElement | null>(null);
  const [geom, setGeom] = useState<Geometry>(DEFAULT_GEOM);

  const onSuccessDoneRef = useRef(props.onSuccessDone);
  const successDoneCalled = useRef(false);

  useEffect(() => {
    onSuccessDoneRef.current = props.onSuccessDone;
  }, [props.onSuccessDone]);

  // Ukuran kotak menyesuaikan lebar kartu (HP 360 px tetap muat 6 kotak).
  useEffect(() => {
    const el = inputsRowRef.current;
    if (!el) return;
    const measure = () => setGeom(computeGeometry(el.clientWidth, length));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [length]);

  // Animasi berhasil selesai → beri tahu induk tepat sekali.
  useEffect(() => {
    if (status !== "success" || successDoneCalled.current) return;
    const t = window.setTimeout(() => {
      if (successDoneCalled.current) return;
      successDoneCalled.current = true;
      onSuccessDoneRef.current();
    }, SUCCESS_TOTAL_MS);
    return () => window.clearTimeout(t);
  }, [status]);

  // Seperti aslinya: kotak dilepas fokusnya saat kode lengkap.
  useEffect(() => {
    if (status === "checking" || status === "success") {
      inputRefs.current.forEach((el) => el?.blur());
    }
  }, [status]);

  // Setelah induk mengosongkan kode (mis. sesudah salah), fokus kembali ke kotak pertama.
  useEffect(() => {
    if (status === "idle" && value === "") inputRefs.current[0]?.focus();
  }, [status, value]);

  const animState = status === "success" ? "success" : status === "error" ? "error" : "idle";
  const locked = status === "checking" || status === "success";
  const isSuccess = status === "success";
  const digits = Array.from({ length }, (_, i) => value[i] ?? "");

  // Fokus dipindah oleh kode (setelah mengetik) → lewati pengecekan "lompat ke kotak kosong pertama" di onFocus,
  // karena nilai `value` dari induk belum ter-update pada saat itu (dulu kursor memantul kembali ke kotak 1).
  const programmaticFocus = useRef(false);
  const focusBox = (i: number) => {
    const el = inputRefs.current[Math.max(0, Math.min(length - 1, i))];
    programmaticFocus.current = true;
    el?.focus();
    programmaticFocus.current = false;
    el?.select();
  };

  const commit = (next: string) => {
    onChange(next.replace(/\D/g, "").slice(0, length));
  };

  const handleChange = (index: number, e: ChangeEvent<HTMLInputElement>) => {
    if (locked) return;
    const typed = e.target.value.replace(/\D/g, "");
    if (typed === "") return;
    const current = digits[index];

    if (typed.length === 1 || (typed.length === 2 && current !== "")) {
      // Satu angka baru (atau mengganti angka yang sudah ada).
      const d = typed.length === 1 ? typed : typed[0] === current ? typed[1] : typed[0];
      const arr = [...digits];
      arr[index] = d;
      const next = arr.join("");
      commit(next);
      if (index < length - 1) focusBox(Math.min(index + 1, next.length));
      return;
    }

    // Beberapa angka sekaligus (isi otomatis one-time-code / tempel ke satu kotak).
    const next = (value.slice(0, index) + typed).slice(0, length);
    commit(next);
    focusBox(Math.min(next.length, length - 1));
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (locked) return;
    if (e.key === "Backspace") {
      e.preventDefault();
      if (digits[index]) {
        commit(value.slice(0, index) + value.slice(index + 1));
        focusBox(index);
      } else if (index > 0) {
        commit(value.slice(0, index - 1) + value.slice(index));
        focusBox(index - 1);
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      e.preventDefault();
      focusBox(index - 1);
    } else if (e.key === "ArrowRight" && index < length - 1) {
      e.preventDefault();
      focusBox(Math.min(index + 1, value.length));
    }
  };

  const handleFocus = (index: number) => {
    // Kode selalu berurutan: lompat ke kotak kosong pertama bila mengetuk kotak setelahnya.
    if (!programmaticFocus.current && index > value.length) focusBox(value.length);
    else inputRefs.current[index]?.select();
  };

  const handlePaste = (e: ClipboardEvent<HTMLDivElement>) => {
    if (locked) return;
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (!pasted) return;
    commit(pasted);
    focusBox(Math.min(pasted.length, length - 1));
  };

  // Geometri efek (garis, gelombang kejut, centang) mengikuti ukuran kotak.
  const f = formation(0, length, geom.size);
  const svgHalf = f.halfX + geom.size;
  const pathD = `M ${-f.halfX} ${f.halfY} L ${-f.halfX} ${-f.halfY} L ${f.halfX} ${-f.halfY} L ${f.halfX} ${f.halfY} Z`;
  const radius = geom.size * 0.25;
  const tickSize = geom.size * 0.5;

  const containerClass = [
    styles.otpContainer,
    isSuccess ? styles.isComplete : "",
    status === "checking" ? styles.isChecking : "",
    status === "error" ? styles.isError : "",
  ]
    .filter(Boolean)
    .join(" ");

  const shownMessage =
    isSuccess ? null : message ?? (status === "checking" ? { tone: "info" as const, text: OTP_TEXT.checking } : null);

  return (
    <MotionConfig reducedMotion="user">
      <div className={containerClass}>
        <div className={styles.dragHandle} />
        <div className={styles.otpHeader}>
          <AnimatePresence mode="wait">
            {!isSuccess ? (
              <motion.div
                key="unverified"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10, transition: { delay: MOVE_DURATION, duration: 0.3 } }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
              >
                <h1 className={styles.title}>{OTP_TEXT.title}</h1>
                <p className={styles.subtitle}>{OTP_TEXT.subtitle(email)}</p>
              </motion.div>
            ) : (
              <motion.div
                key="verified"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: "easeInOut" }}
              >
                <h1 className={`${styles.title} ${styles.titleSuccess}`}>{OTP_TEXT.successTitle}</h1>
                <p className={styles.subtitle}>{OTP_TEXT.successSub}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <motion.div
          ref={inputsRowRef}
          className={styles.otpInputs}
          style={{ gap: geom.gap, minHeight: geom.size }}
          onPaste={handlePaste}
          variants={containerVariants}
          initial="idle"
          animate={animState}
        >
          <AnimatePresence>
            {isSuccess && (
              <>
                {/* Connecting Dotted Line */}
                <motion.svg
                  key="dotted-line"
                  viewBox={`${-svgHalf} ${-svgHalf} ${svgHalf * 2} ${svgHalf * 2}`}
                  style={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    x: "-50%",
                    y: "-50%",
                    width: `${svgHalf * 2}px`,
                    height: `${svgHalf * 2}px`,
                    zIndex: 0,
                    pointerEvents: "none",
                  }}
                  initial={{ opacity: 1, scale: 1 }}
                  animate={{ opacity: [1, 1, 1, 1], scale: [1, 1, 1, 0] }}
                  transition={{ duration: MOVE_DURATION, times: [0, 0.19, 0.86, 1], ease: "easeInOut" }}
                >
                  <motion.path
                    d={pathD}
                    fill="none"
                    stroke="#888"
                    strokeWidth="4"
                    strokeDasharray="4 12"
                    strokeLinecap="round"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ delay: 0.4, duration: 1.3, ease: "easeInOut" }}
                  />
                </motion.svg>

                {/* Success Shockwave */}
                <motion.div
                  key="shockwave"
                  style={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    x: "-50%",
                    y: "-50%",
                    width: `${geom.size}px`,
                    height: `${geom.size}px`,
                    borderRadius: `${radius}px`,
                    border: "1px solid #22c55e",
                    zIndex: 0,
                    pointerEvents: "none",
                  }}
                  initial={{ opacity: 0, scale: 1 }}
                  animate={{ opacity: [0, 0.8, 0], scale: [1, 2.5, 3.5] }}
                  transition={{ delay: MOVE_DURATION, duration: 0.8, ease: "easeOut" }}
                />

                {/* Confetti Explosion */}
                {CONFETTI.map((c, i) => (
                  <motion.div
                    key={`confetti-${i}`}
                    style={{
                      position: "absolute",
                      top: "50%",
                      left: "50%",
                      marginLeft: `-${c.size / 2}px`,
                      marginTop: `-${c.size / 2}px`,
                      width: `${c.size}px`,
                      height: `${c.size}px`,
                      backgroundColor: c.color,
                      borderRadius: c.isCircle ? "50%" : "2px",
                      zIndex: 15,
                      pointerEvents: "none",
                    }}
                    initial={{ x: 0, y: 0, scale: 0, opacity: 0 }}
                    animate={{
                      x: c.x,
                      y: c.y,
                      scale: [0, 1, 1, 0],
                      opacity: [0, 1, 1, 0],
                      rotate: c.isCircle ? 0 : [0, 360, 720],
                    }}
                    transition={{
                      delay: MOVE_DURATION,
                      duration: c.duration,
                      ease: "easeOut",
                      times: [0, 0.1, 0.8, 1],
                    }}
                  />
                ))}
              </>
            )}
          </AnimatePresence>

          {digits.map((digit, index) => (
            <motion.div
              key={index}
              className={index === 0 ? `${styles.inputWrapper} ${styles.firstBox}` : styles.inputWrapper}
              style={{ width: geom.size, height: geom.size, borderRadius: radius }}
              custom={{ i: index, n: length, geom } satisfies BoxCustom}
              variants={boxVariants}
              initial="idle"
              animate={animState}
            >
              <input
                ref={(el) => {
                  inputRefs.current[index] = el;
                }}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete={index === 0 ? "one-time-code" : "off"}
                aria-label={`Angka ${index + 1} dari ${length}`}
                value={digit}
                onChange={(e) => handleChange(index, e)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                onFocus={() => handleFocus(index)}
                className={styles.otpInput}
                style={{ borderRadius: Math.max(0, radius - 2.5) }}
                readOnly={locked}
              />

              {index === 0 && (
                <motion.svg
                  viewBox="0 0 24 24"
                  fill="none"
                  className={styles.finalTick}
                  initial={{ opacity: 0, scale: 0.5, x: "-50%", y: "-50%" }}
                  animate={
                    isSuccess
                      ? { opacity: 1, scale: 1, x: "-50%", y: "-50%" }
                      : { opacity: 0, scale: 0.5, x: "-50%", y: "-50%" }
                  }
                  transition={{ delay: isSuccess ? MOVE_DURATION : 0, duration: 0.5, type: "spring", stiffness: 250, damping: 20 }}
                  style={{ width: tickSize, height: tickSize }}
                  aria-hidden="true"
                >
                  <motion.path
                    d="M5 13l4 4L19 7"
                    stroke="#ffffff"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={{ pathLength: 0 }}
                    animate={isSuccess ? { pathLength: 1 } : { pathLength: 0 }}
                    transition={{ delay: isSuccess ? 2.3 : 0, duration: 0.4, ease: "easeOut" }}
                  />
                </motion.svg>
              )}
            </motion.div>
          ))}
        </motion.div>

        <div className={styles.messageArea} aria-live="polite">
          {shownMessage && (
            <p
              className={`${styles.message} ${
                shownMessage.tone === "error" ? styles.messageError : styles.messageInfo
              }`}
            >
              {shownMessage.text}
            </p>
          )}
        </div>

        <div className={styles.footerArea}>
          <AnimatePresence>
            {!isSuccess && (
              <motion.div
                key="footer"
                className={styles.otpFooter}
                initial={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <div>
                  {OTP_TEXT.noCode}
                  <button
                    type="button"
                    className={styles.footerButton}
                    onClick={onResend}
                    disabled={resendPending || locked}
                  >
                    {OTP_TEXT.resend}
                  </button>
                </div>
                <button
                  type="button"
                  className={styles.changeButton}
                  onClick={onChangeContact}
                  disabled={locked}
                >
                  {OTP_TEXT.changeContact}
                </button>
              </motion.div>
            )}
          </AnimatePresence>
          <AnimatePresence>
            {isSuccess && (
              <motion.div
                key="secure"
                className={styles.successBottom}
                initial={{ opacity: 0, y: 15, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: 2.7, duration: 0.5, type: "spring", stiffness: 300, damping: 20 }}
              >
                <Lock size={20} /> Terverifikasi &amp; aman
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </MotionConfig>
  );
}
