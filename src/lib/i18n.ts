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
  return found === undefined ? text : text.replace(trimmed, found);
}

export function saveLang(lang: Lang) {
  document.cookie = `${LANG_COOKIE}=${lang}; path=/; max-age=31536000; samesite=lax`;
}
