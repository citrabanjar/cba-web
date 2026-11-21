"use client";

import { useEffect, useState, useTransition } from "react";
import { CheckCircle2, Loader2, Send, XCircle } from "lucide-react";
import { T, useT } from "@/components/i18n";
import { showNotice } from "@/components/portal/Confirm";
import { activateTelegramWebhook, telegramStatus, type TelegramStatus } from "./telegram-actions";

function Row({ ok, label, value }: { ok: boolean; label: string; value?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {ok ? <CheckCircle2 size={15} className="shrink-0 text-emerald-600" /> : <XCircle size={15} className="shrink-0 text-gray-400" />}
      <span className="text-gray-600"><T>{label}</T></span>
      {value && <span className="truncate font-medium text-gray-900">{value}</span>}
    </div>
  );
}

// Pengaturan → Fitur (Super Admin): status Telegram Bot dan tombol daftarkan webhook.
// Token bot dibuat pemilik lewat @BotFather lalu disimpan sendiri di Vercel; halaman ini tidak pernah menampilkannya.
export default function TelegramSettings() {
  const t = useT();
  const [s, setS] = useState<TelegramStatus | null>(null);
  const [pending, start] = useTransition();
  useEffect(() => { void telegramStatus().then(setS); }, []);
  const activate = () => start(async () => {
    const r = await activateTelegramWebhook();
    setS(r);
    void showNotice(r.error ? t(r.error) : t("Webhook Telegram aktif."), r.error ? "error" : "ok");
  });
  return (
    <section className="mt-5 rounded-2xl border border-gray-200 bg-white p-5">
      <div className="flex flex-wrap items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-rose-400 text-white"><Send size={16} /></span>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-gray-900"><T>Telegram Bot</T></h3>
          <p className="text-xs text-gray-500"><T>Notifikasi dan Setujui/Tolak Cuti, Pengajuan Absen, Dinas Luar, Lembur, dan Lupa Absen lewat Telegram. Opsional: karyawan menghubungkan sendiri di Profil Saya → Akun.</T></p>
        </div>
        <button type="button" disabled={pending || !s?.token} onClick={activate}
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-ink px-4 text-xs font-semibold text-white hover:bg-ink/85 disabled:opacity-50">
          {pending && <Loader2 size={14} className="animate-spin" />} <T>Aktifkan Webhook</T>
        </button>
      </div>
      {!s ? <p className="mt-3 text-sm text-gray-400"><T>Memeriksa...</T></p> : (
        <div className="mt-3 space-y-1.5">
          <Row ok={s.token} label="Token bot (TELEGRAM_BOT_TOKEN)" value={s.token ? t("terisi") : t("belum diisi di Vercel")} />
          <Row ok={!!s.bot} label="Nama bot (TELEGRAM_BOT_USERNAME)" value={s.bot ? `@${s.bot}` : t("belum diisi di Vercel")} />
          <Row ok={s.secret} label="Kata rahasia (TELEGRAM_WEBHOOK_SECRET)" value={s.secret ? t("terisi") : t("belum diisi di Vercel")} />
          <Row ok={s.ok} label="Webhook" value={s.ok ? t("aktif") : s.webhook ? t("terdaftar ke alamat lain") : t("belum didaftarkan")} />
          <Row ok={s.linked > 0} label="Karyawan terhubung" value={String(s.linked)} />
          {s.error && <p className="text-xs text-rose-600">{s.error}</p>}
        </div>
      )}
    </section>
  );
}
