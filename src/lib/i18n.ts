import { en } from "@/lib/i18n-en";

export type Lang = "id" | "en";

export const LANG_COOKIE = "lang";

export function toLang(value: string | undefined): Lang {
  return value === "en" ? "en" : "id";
}

// Spasi di tepi dipertahankan, karena potongan teks di sekitar angka membutuhkannya.
export function translate(lang: Lang, text: string): string {
  if (lang === "id") return text;
  // Pesan beberapa baris diterjemahkan per baris.
  if (text.includes("\n")) return text.split("\n").map((line) => translate(lang, line)).join("\n");
  const trimmed = text.trim();
  const found = en[trimmed];
  if (found !== undefined) return text.replace(trimmed, found);
  for (const [re, to] of EN_PATTERNS) if (re.test(trimmed)) return text.replace(trimmed, typeof to === "string" ? trimmed.replace(re, to) : trimmed.replace(re, to));
  return text;
}

// "1 jam 15 menit" → "1 hour 15 minutes".
const durEn = (d: string) => d
  .replace(/(\d+) jam/, (_, n: string) => `${n} hour${n === "1" ? "" : "s"}`)
  .replace(/(\d+) menit/, (_, n: string) => `${n} minute${n === "1" ? "" : "s"}`);

// Pesan yang memuat jam / angka dari server tidak bisa dicocokkan persis dengan kamus, jadi diterjemahkan lewat pola.
const EN_PATTERNS: [RegExp, string | ((m: string, d: string) => string)][] = [
  [/^Absen masuk baru dibuka pukul (\d{2}:\d{2}) besok\.$/, "Check-in opens at $1 tomorrow."],
  [/^Absen masuk baru dibuka pukul (\d{2}:\d{2})\.$/, "Check-in opens at $1."],
  [/^Anda terlambat (.+)\.$/, (_, d) => `You are ${durEn(d)} late.`],
  [/^Anda pulang (.+) lebih awal\.$/, (_, d) => `You are leaving ${durEn(d)} early.`],
  [/^Perkiraan potongan: (Rp [\d.]+)\.$/, "Estimated deduction: $1."],
];

export function saveLang(lang: Lang) {
  document.cookie = `${LANG_COOKIE}=${lang}; path=/; max-age=31536000; samesite=lax`;
}
