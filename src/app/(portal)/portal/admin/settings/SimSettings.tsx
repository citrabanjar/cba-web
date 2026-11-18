"use client";

import { useState, useTransition } from "react";
import { FlaskConical, Loader2, Play, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { T } from "@/components/i18n";
import { DateInput } from "@/components/ui/date-input";
import { clearSim, runSimNow, setSimEnabled } from "./sim-actions";
import { askConfirm } from "@/components/portal/Confirm";

// Pengaturan → Fitur (Super Admin): absen uji untuk masa testing.
export default function SimSettings({ enabled: initial, count, requests }: { enabled: boolean; count: number; requests: number }) {
  const [enabled, setEnabled] = useState(initial);
  const [reqCount, setReqCount] = useState(5); // jumlah pengajuan uji (menunggu persetujuan) per sekali isi
  // Isi sekarang: sejak tanggal tertentu sampai hari ini (WIB; hari ini sesuai jam sekarang), paling banyak 31 hari.
  const DAY = 86_400_000;
  const [today] = useState(() => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10));
  const [from, setFrom] = useState(() => new Date(Date.now() + 7 * 3600_000 - 7 * DAY).toISOString().slice(0, 10));
  const daysFrom = (f: string) => /^\d{4}-\d{2}-\d{2}$/.test(f) ? Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${f}T00:00:00Z`)) / DAY) + 1 : 0;
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
          <T>Mengisi absen pura-pura untuk semua karyawan aktif mengikuti shift masing-masing, dengan skenario acak: tepat waktu, terlambat, pulang cepat, lupa absen pulang, lembur, dan alpha. Karyawan yang sudah absen, cuti, dinas, atau libur dilewati. Skenario lembur ikut membuat data lembur yang sudah disetujui (dibayar per jam penuh sampai absen pulang). Semua catatan bertanda [UJI].</T>
          {" "}<T>Juga membuat pengajuan uji untuk tanggal ke depan (cuti tahunan, sakit, izin, dinas luar, pinjaman, tukar shift, lembur) lewat jalur pengajuan asli. Pengajuan ini menunggu persetujuan penyetuju asli; approval dites manual.</T>
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200 px-4 py-3">
          <input type="checkbox" checked={enabled} disabled={busy !== null} className="mt-0.5 h-4 w-4 accent-[var(--color-brand)]"
            onChange={(e) => { const v = e.target.checked; act("toggle", async () => { await setSimEnabled(v); setEnabled(v); return v ? "Absen uji otomatis dinyalakan." : "Absen uji otomatis dimatikan."; }); }} />
          <span>
            <span className="block text-sm font-semibold text-gray-800"><T>Isi otomatis tiap malam</T></span>
            <span className="block text-xs text-gray-500"><T>Setiap malam sistem mengisi absen uji untuk hari kemarin. Matikan sebelum portal dipakai sungguhan.</T> <T>Isi Sekarang juga mengisi hari ini sesuai jam saat tombol ditekan: yang belum lewat jam pulang tercatat belum absen pulang.</T></span>
          </span>
        </label>

        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-gray-50 px-4 py-3 text-sm">
          <span className="text-gray-600"><T>Isi sekarang sejak tanggal</T></span>
          <div className="w-44"><DateInput value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <span className="text-gray-600"><T>sampai hari ini</T>{daysFrom(from) > 0 && <> ({daysFrom(from)} <T>hari</T>)</>}</span>
          <span className="text-gray-600"><T>dan pengajuan uji</T></span>
          <select value={reqCount} onChange={(e) => setReqCount(Number(e.target.value))} className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-sm">
            {[0, 3, 5, 10, 20].map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <Button size="sm" className="ml-auto gap-1.5" disabled={busy !== null}
            onClick={() => act("run", async () => {
              const days = daysFrom(from);
              if (days < 1) throw new Error("Pilih tanggal paling lambat hari ini.");
              if (days > 31) throw new Error("Paling banyak 31 hari sekali isi. Pilih tanggal yang lebih dekat.");
              const r = await runSimNow(days, reqCount);
              const req = r.requests && Object.keys(r.requests).length ? ` Pengajuan uji ${r.requestTotal}: ${Object.entries(r.requests).map(([k, v]) => `${v} ${k}`).join(", ")}.` : reqCount ? " Pengajuan uji: tidak ada yang lolos aturan pengajuan." : "";
              return `${r.created ?? 0} absen uji dan ${r.overtime ?? 0} lembur uji dibuat.${req}`;
            })}>
            {busy === "run" ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} <T>Isi Sekarang</T>
          </Button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-gray-50 px-4 py-3 text-sm">
          <span className="text-gray-600"><T>Absen uji tersimpan</T>: <b>{count}</b> · <T>Pengajuan uji</T>: <b>{requests}</b></span>
          <Button size="sm" variant="outline" className="gap-1.5 text-rose-600" disabled={busy !== null || count + requests === 0}
            onClick={async () => { if (await askConfirm("Hapus semua absen uji, lembur uji, dan pengajuan uji? Data asli tidak ikut terhapus.")) act("clear", async () => { const r = await clearSim(); return `${r.deleted ?? 0} absen uji dihapus.`; }); }}>
            {busy === "clear" ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} <T>Hapus Semua Absen Uji</T>
          </Button>
        </div>

        {msg && <p className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}><T>{msg.text}</T></p>}
      </CardContent>
    </Card>
  );
}
