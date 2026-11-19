import { en } from "@/lib/i18n-en";

export type Lang = "id" | "en";

export const LANG_COOKIE = "lang";

export function toLang(value: string | undefined): Lang {
  return value === "en" ? "en" : "id";
}

// Spasi di tepi dipertahankan, karena potongan teks di sekitar angka membutuhkannya.
export function translate(lang: Lang, text: string): string {
  if (lang === "id") return text;
  const trimmed = text.trim();
  const found = en[trimmed];
  if (found !== undefined) return text.replace(trimmed, found);
  for (const [re, to] of EN_PATTERNS) if (re.test(trimmed)) return text.replace(trimmed, trimmed.replace(re, to));
  return text;
}

// Pesan yang memuat jam / angka dari server tidak bisa dicocokkan persis dengan kamus, jadi diterjemahkan lewat pola.
const EN_PATTERNS: [RegExp, string][] = [
  [/^Absen masuk baru dibuka pukul (\d{2}:\d{2}) besok\.$/, "Check-in opens at $1 tomorrow."],
  [/^Absen masuk baru dibuka pukul (\d{2}:\d{2})\.$/, "Check-in opens at $1."],
];

export function saveLang(lang: Lang) {
  document.cookie = `${LANG_COOKIE}=${lang}; path=/; max-age=31536000; samesite=lax`;
}
