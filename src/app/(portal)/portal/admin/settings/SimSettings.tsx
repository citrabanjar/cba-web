"use client";

import { useState, useTransition } from "react";
import { FlaskConical, Loader2, Play, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { T } from "@/components/i18n";
import { clearSim, runSimNow, setSimEnabled } from "./sim-actions";

// Pengaturan → Fitur (Super Admin): absen uji untuk masa testing.
export default function SimSettings({ enabled: initial, count }: { enabled: boolean; count: number }) {
  const [enabled, setEnabled] = useState(initial);
  const [days, setDays] = useState(7);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [, start] = useTransition();
  const act = (key: string, fn: () => Promise<string>) => {
    setMsg(null); setBusy(key);
    start(async () => {
      try { setMsg({ ok: true, text: await fn() }); }
      catch (e) {
        const text = e instanceof Error ? e.message : "";
        // Halaman dibuka sebelum versi baru portal dipasang: tombolnya sudah tidak dikenali server.
        setMsg({ ok: false, text: /server action|failed to find|failed to fetch|network/i.test(text) ? "Portal baru diperbarui. Muat ulang halaman (Ctrl+F5), lalu coba lagi." : text || "Gagal." });
      } finally { setBusy(null); }
    });
  };

  return (
    <Card className="border-amber-200">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gray-600">
          <FlaskConical size={16} className="text-amber-600" /> <T>Absen Uji (masa testing)</T>
        </CardTitle>
        <p className="text-xs text-gray-400">
          <T>Mengisi absen pura-pura untuk semua karyawan aktif mengikuti shift masing-masing, dengan skenario acak: tepat waktu, terlambat, pulang cepat, lupa absen pulang, lembur, dan alpha. Karyawan yang sudah absen, cuti, dinas, atau libur dilewati. Semua catatan bertanda [UJI].</T>
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200 px-4 py-3">
          <input type="checkbox" checked={enabled} disabled={busy !== null} className="mt-0.5 h-4 w-4 accent-[var(--color-brand)]"
            onChange={(e) => { const v = e.target.checked; act("toggle", async () => { await setSimEnabled(v); setEnabled(v); return v ? "Absen uji otomatis dinyalakan." : "Absen uji otomatis dimatikan."; }); }} />
          <span>
            <span className="block text-sm font-semibold text-gray-800"><T>Isi otomatis tiap malam</T></span>
            <span className="block text-xs text-gray-500"><T>Setiap malam sistem mengisi absen uji untuk hari kemarin. Matikan sebelum portal dipakai sungguhan.</T></span>
          </span>
        </label>

        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-gray-50 px-4 py-3 text-sm">
          <span className="text-gray-600"><T>Isi sekarang untuk</T></span>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-sm">
            {[1, 3, 7, 14, 30].map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <span className="text-gray-600"><T>hari terakhir (sampai kemarin)</T></span>
          <Button size="sm" className="ml-auto gap-1.5" disabled={busy !== null}
            onClick={() => act("run", async () => { const r = await runSimNow(days); return `${r.created ?? 0} absen uji dibuat.`; })}>
            {busy === "run" ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} <T>Isi Sekarang</T>
          </Button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-gray-50 px-4 py-3 text-sm">
          <span className="text-gray-600"><T>Absen uji tersimpan</T>: <b>{count}</b></span>
          <Button size="sm" variant="outline" className="gap-1.5 text-rose-600" disabled={busy !== null || count === 0}
            onClick={() => { if (window.confirm("Hapus semua absen uji? Absen asli tidak ikut terhapus.")) act("clear", async () => { const r = await clearSim(); return `${r.deleted ?? 0} absen uji dihapus.`; }); }}>
            {busy === "clear" ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} <T>Hapus Semua Absen Uji</T>
          </Button>
        </div>

        {msg && <p className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}><T>{msg.text}</T></p>}
      </CardContent>
    </Card>
  );
}
