"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import type { OtpDesignProps } from "./types";

// Empat desain OTP asli dari galeri codexr pilihan pemilik (24, 67, 70, 28). Dimuat hanya di browser
// (animasi, Lottie, Web Audio) dan hanya desain yang terpilih yang diunduh.
const DESIGNS = {
  "24": dynamic(() => import("./OtpDesign24"), { ssr: false }),
  "67": dynamic(() => import("./OtpDesign67"), { ssr: false }),
  "70": dynamic(() => import("./OtpDesign70"), { ssr: false }),
  "28": dynamic(() => import("./OtpDesign28"), { ssr: false }),
} as const;
type DesignKey = keyof typeof DESIGNS;
const KEYS = Object.keys(DESIGNS) as DesignKey[];
const LAST_KEY = "cba-otp-design";

// Acak, tetapi tidak pernah sama dengan desain yang terakhir tampil di browser ini.
function pickDesign(): DesignKey {
  // Untuk mencoba satu desain tertentu: /onboarding?desain=24 (atau 67, 70, 28).
  try {
    const forced = new URLSearchParams(window.location.search).get("desain");
    if (forced && forced in DESIGNS) return forced as DesignKey;
  } catch { /* abaikan */ }
  let last: string | null = null;
  try { last = localStorage.getItem(LAST_KEY); } catch { /* localStorage tidak tersedia */ }
  const pool = KEYS.filter((k) => k !== last);
  const pick = pool[Math.floor(Math.random() * pool.length)];
  try { localStorage.setItem(LAST_KEY, pick); } catch { /* abaikan */ }
  return pick;
}

export default function RandomOtp(props: OtpDesignProps) {
  const [key] = useState<DesignKey>(pickDesign);
  const Design = DESIGNS[key];
  return (
    <div data-otp-design={key} className="w-full">
      <Design {...props} />
    </div>
  );
}
