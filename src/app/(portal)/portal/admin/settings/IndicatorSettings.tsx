"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Loader2, Save } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { T } from "@/components/i18n";
import { INDICATOR_CATALOG } from "@/lib/dashboard-indicators";
import { saveHiddenIndicators } from "./actions";

// Super Admin memilih kartu mana yang ikut di running indikator Beranda admin.
export default function IndicatorSettings({ hidden: initial }: { hidden: string[] }) {
  const [hidden, setHidden] = useState<string[]>(initial);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const changed = [...hidden].sort().join(",") !== [...initial].sort().join(",");

  const toggle = (key: string) => {
    setSaved(false);
    setHidden((h) => (h.includes(key) ? h.filter((k) => k !== key) : [...h, key]));
  };

  function save() {
    setError(null);
    start(async () => {
      const r = await saveHiddenIndicators(hidden);
      if (r.error) setError(r.error);
      else setSaved(true);
    });
  }

  return (
    <Card className="border-gray-100">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
          <T>Running Indikator Beranda</T>
        </CardTitle>
        <p className="text-xs text-gray-400">
          <T>Pilih kartu yang ikut berjalan di Beranda admin. Indikator pekerjaan tetap hilang sendiri saat sudah beres.</T>
        </p>
      </CardHeader>
      <CardContent className="space-y-1">
        {INDICATOR_CATALOG.map((i) => {
          const on = !hidden.includes(i.key);
          return (
            <div key={i.key} className="flex cursor-pointer items-start gap-3 rounded-xl px-2 py-2 hover:bg-gray-50">
              <button type="button" role="switch" aria-checked={on} onClick={() => toggle(i.key)}
                className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors ${on ? "bg-emerald-500" : "bg-gray-300"}`}>
                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
              </button>
              <span className="min-w-0 flex-1" onClick={() => toggle(i.key)}>
                <span className="block text-sm font-semibold text-gray-800"><T>{i.title}</T></span>
                <span className="block text-xs text-gray-400"><T>{i.desc}</T></span>
              </span>
            </div>
          );
        })}
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"><T>{error}</T></p>}
        <div className="flex items-center justify-end gap-3 pt-2">
          {saved && !changed && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-700"><CheckCircle2 size={14} /> <T>Tersimpan</T></span>
          )}
          <button type="button" onClick={save} disabled={pending || !changed}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-ink px-4 text-xs font-semibold text-white hover:bg-ink/85 disabled:opacity-40">
            {pending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} <T>Simpan</T>
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
