"use client";

import { createContext, useContext } from "react";
import { useRouter } from "next/navigation";
import { saveLang, translate, type Lang } from "@/lib/i18n";

const LangContext = createContext<Lang>("id");

export function LangProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

export function useT() {
  const lang = useContext(LangContext);
  return (text: string) => translate(lang, text);
}

// Bisa dipakai di server component maupun client component. Teks asli Bahasa Indonesia
// menjadi kuncinya, dan teks yang belum punya terjemahan tampil apa adanya.
// Prop `en` dipakai kalau satu kata punya arti berbeda sesuai tempatnya.
export function T({ children, en }: { children?: React.ReactNode; en?: string }) {
  const lang = useContext(LangContext);
  if (en && lang === "en") return <>{en}</>;
  return <>{typeof children === "string" ? translate(lang, children) : children}</>;
}

export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const lang = useContext(LangContext);
  const router = useRouter();

  function choose(next: Lang) {
    saveLang(next);
    router.refresh();
  }

  return (
    <div className={`inline-flex rounded-lg border border-gray-200 bg-white p-0.5 text-xs font-semibold ${className}`}>
      {(["id", "en"] as const).map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => choose(option)}
          aria-pressed={lang === option}
          className={`px-2 py-1 rounded-md uppercase transition-colors ${
            lang === option ? "bg-ink text-white" : "text-gray-500 hover:text-gray-800"
          }`}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
