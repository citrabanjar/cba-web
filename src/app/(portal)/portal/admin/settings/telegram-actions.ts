"use server";

import { getAccess } from "@/lib/access";
import { isSuperAdmin } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { portalUrl, telegramBotName, telegramOn, telegramSecret, tgCall } from "@/lib/telegram";

export type TelegramStatus = { token: boolean; bot: string; secret: boolean; webhook: string; ok: boolean; linked: number; error?: string };

// Pengaturan → Fitur → Telegram (Super Admin): cek status bot & webhook, dan daftarkan webhook ke alamat portal.
// Token, nama bot, dan kata rahasia diisi pemilik di Vercel (env); di sini tidak pernah ditampilkan.
export async function telegramStatus(): Promise<TelegramStatus> {
  const access = await getAccess();
  if (!access || !isSuperAdmin(access.role)) return { token: false, bot: "", secret: false, webhook: "", ok: false, linked: 0, error: "Hanya Super Admin." };
  const linked = await prisma.user.count({ where: { telegramChatId: { not: null } } });
  const base = { token: telegramOn(), bot: telegramBotName(), secret: !!telegramSecret(), linked };
  if (!base.token) return { ...base, webhook: "", ok: false };
  const info = await tgCall<{ url: string; last_error_message?: string }>("getWebhookInfo", {});
  const url = info.result?.url ?? "";
  return { ...base, webhook: url, ok: url.endsWith("/api/telegram/webhook"), ...(info.result?.last_error_message ? { error: info.result.last_error_message } : {}) };
}

// Telegram tidak mengikuti pengalihan (mis. citrabanjar.com → www.citrabanjar.com, 308), jadi alamat webhook
// didaftarkan memakai alamat akhir setelah pengalihan.
async function finalUrl(url: string) {
  let cur = url;
  for (let i = 0; i < 3; i++) {
    const r = await fetch(cur, { method: "POST", redirect: "manual", headers: { "Content-Type": "application/json" }, body: "{}" }).catch(() => null);
    const loc = r && r.status >= 300 && r.status < 400 ? r.headers.get("location") : null;
    if (!loc) break;
    cur = new URL(loc, cur).toString();
  }
  return cur;
}

export async function activateTelegramWebhook(): Promise<TelegramStatus> {
  const access = await getAccess();
  if (!access || !isSuperAdmin(access.role)) return { token: false, bot: "", secret: false, webhook: "", ok: false, linked: 0, error: "Hanya Super Admin." };
  if (!telegramOn() || !telegramSecret()) return { ...(await telegramStatus()), error: "Isi TELEGRAM_BOT_TOKEN dan TELEGRAM_WEBHOOK_SECRET di Vercel lebih dulu, lalu redeploy." };
  const r = await tgCall("setWebhook", {
    url: await finalUrl(portalUrl("/api/telegram/webhook")), secret_token: telegramSecret(), allowed_updates: ["message", "callback_query"], drop_pending_updates: true,
  });
  // Daftar perintah di tombol Menu Telegram.
  await tgCall("setMyCommands", { commands: [
    { command: "menu", description: "Buat pengajuan (Absen, Lembur, Cuti, Dinas Luar)" },
    { command: "putus", description: "Lepas akun portal dari Telegram" },
  ] });
  const status = await telegramStatus();
  return r.ok ? status : { ...status, error: r.description ?? "Gagal mendaftarkan webhook." };
}
