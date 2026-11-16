"use client";

// Pop-up singkat (toast) untuk info / peringatan: muncul di tengah layar ±3 detik lalu hilang sendiri.
// Panggil toast("teks", "info" | "ok" | "warn" | "error") dari komponen klien mana pun; <Toaster /> dipasang sekali di PortalShell.
import { useEffect, useState } from "react";
import { CheckCircle2, Info, TriangleAlert, XCircle, X } from "lucide-react";
import { useT } from "@/components/i18n";

export type ToastTone = "info" | "ok" | "warn" | "error";
type Item = { id: number; text: string; tone: ToastTone };
const EVENT = "cba:toast";
let seq = 0;
// Pop-up yang dikirim sebelum <Toaster /> siap (mis. dari efek saat halaman pertama dibuka) ditampung dulu.
let ready = false;
const queue: Item[] = [];

let last = { text: "", at: 0 };

export function toast(text: string, tone: ToastTone = "info") {
  if (typeof window === "undefined" || !text) return;
  // Pesan yang sama berturut-turut dalam 1,5 detik cukup tampil sekali.
  const now = Date.now();
  if (last.text === text && now - last.at < 1500) return;
  last = { text, at: now };
  const item = { id: ++seq, text, tone };
  if (!ready) { queue.push(item); return; }
  window.dispatchEvent(new CustomEvent<Item>(EVENT, { detail: item }));
}

const STYLE: Record<ToastTone, { box: string; Icon: typeof Info }> = {
  info: { box: "border-sky-200 bg-white text-gray-800", Icon: Info },
  ok: { box: "border-emerald-200 bg-white text-gray-800", Icon: CheckCircle2 },
  warn: { box: "border-amber-300 bg-amber-50 text-amber-900", Icon: TriangleAlert },
  error: { box: "border-red-200 bg-red-50 text-red-800", Icon: XCircle },
};
const ICON_COLOR: Record<ToastTone, string> = { info: "text-sky-500", ok: "text-emerald-500", warn: "text-amber-500", error: "text-red-500" };

export function Toaster() {
  const t = useT();
  const [items, setItems] = useState<Item[]>([]);
  useEffect(() => {
    const on = (e: Event) => {
      const it = (e as CustomEvent<Item>).detail;
      setItems((x) => [...x.slice(-3), it]);
      // Peringatan / galat sedikit lebih lama supaya sempat terbaca.
      setTimeout(() => setItems((x) => x.filter((y) => y.id !== it.id)), it.tone === "warn" || it.tone === "error" ? 4000 : 3000);
    };
    window.addEventListener(EVENT, on);
    ready = true;
    for (const it of queue.splice(0)) on(new CustomEvent<Item>(EVENT, { detail: it }));
    return () => { ready = false; window.removeEventListener(EVENT, on); };
  }, []);
  if (!items.length) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-[100] flex flex-col items-center justify-center gap-2 px-4">
      {items.map((it) => {
        const { box, Icon } = STYLE[it.tone];
        return (
          <div key={it.id} role="status" className={`pointer-events-auto flex w-full max-w-md items-start gap-2.5 rounded-2xl border px-4 py-3 text-sm shadow-2xl animate-in fade-in zoom-in-95 ${box}`}>
            <Icon size={17} className={`mt-0.5 shrink-0 ${ICON_COLOR[it.tone]}`} />
            <span className="min-w-0 flex-1">{t(it.text)}</span>
            <button type="button" aria-label={t("Tutup")} onClick={() => setItems((x) => x.filter((y) => y.id !== it.id))} className="shrink-0 rounded-full p-0.5 opacity-50 hover:opacity-100"><X size={14} /></button>
          </div>
        );
      })}
    </div>
  );
}
