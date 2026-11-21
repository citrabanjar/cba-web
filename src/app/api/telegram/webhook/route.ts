import { NextResponse } from "next/server";
import { telegramOn, telegramSecret } from "@/lib/telegram";
import { handleTelegramUpdate, type TgUpdate } from "@/lib/telegram-approval";

// Webhook Telegram Bot: pesan & klik tombol Setujui/Tolak dari Telegram masuk ke sini.
// Hanya diterima bila header X-Telegram-Bot-Api-Secret-Token sama dengan TELEGRAM_WEBHOOK_SECRET (diatur saat Super Admin
// menekan "Aktifkan Webhook" di Pengaturan → Fitur), jadi pihak lain tidak bisa memalsukan klik tombol.
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: Request) {
  const secret = telegramSecret();
  if (!telegramOn() || !secret || req.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await handleTelegramUpdate((await req.json()) as TgUpdate);
  } catch {
    // Selalu jawab 200 supaya Telegram tidak mengulang kiriman yang sama terus-menerus.
  }
  return NextResponse.json({ ok: true });
}
