"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { telegramBotName, telegramOn, tgSend } from "@/lib/telegram";

// Profil Saya → Akun → Hubungkan Telegram (opsional). Membuat kode sekali pakai (15 menit) untuk tautan
// t.me/<bot>?start=<kode>; saat karyawan menekan Start di Telegram, webhook menyimpan chat-nya ke akun ini.
export async function createTelegramLink(): Promise<{ url?: string; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Sesi tidak valid, silakan login ulang." };
  const bot = telegramBotName();
  if (!telegramOn() || !bot) return { error: "Telegram belum diaktifkan perusahaan." };
  const code = randomBytes(12).toString("hex");
  await prisma.user.update({ where: { id: session.user.id }, data: { telegramLinkCode: code, telegramLinkExpires: new Date(Date.now() + 15 * 60_000) } });
  return { url: `https://t.me/${bot}?start=${code}` };
}

export async function unlinkTelegram(): Promise<{ error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Sesi tidak valid, silakan login ulang." };
  const u = await prisma.user.findUnique({ where: { id: session.user.id }, select: { telegramChatId: true } });
  await prisma.user.update({ where: { id: session.user.id }, data: { telegramChatId: null, telegramLinkCode: null, telegramLinkExpires: null } });
  if (u?.telegramChatId) await tgSend(u.telegramChatId, "Telegram sudah dilepas dari akun portal.").catch(() => null);
  revalidatePath("/portal/profil");
  return {};
}
