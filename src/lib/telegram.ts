// Telegram Bot API (opsional). Token dibuat pemilik lewat @BotFather dan disimpan di Vercel (env), tidak di kode:
//   TELEGRAM_BOT_TOKEN       token bot
//   TELEGRAM_BOT_USERNAME    nama bot tanpa @ (untuk tautan t.me/<bot>?start=<kode>)
//   TELEGRAM_WEBHOOK_SECRET  kata rahasia; Telegram mengirimnya di header X-Telegram-Bot-Api-Secret-Token
// Tanpa token, semua fungsi diam (tidak mengirim apa pun) supaya portal tetap jalan.
// Gagal kirim tidak boleh menggagalkan proses di portal (pengajuan / keputusan tetap tersimpan).

// data: tombol aksi (callback); url: tombol yang membuka halaman portal.
export type TgButton = { text: string; data?: string; url?: string };

const token = () => process.env.TELEGRAM_BOT_TOKEN?.trim() || "";
export const telegramOn = () => !!token();
export const telegramBotName = () => process.env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, "") || "";
export const telegramSecret = () => process.env.TELEGRAM_WEBHOOK_SECRET?.trim() || "";

export async function tgCall<T = unknown>(method: string, body: Record<string, unknown>): Promise<{ ok: boolean; result?: T; description?: string }> {
  if (!telegramOn()) return { ok: false, description: "Telegram belum diaktifkan." };
  try {
    const r = await fetch(`https://api.telegram.org/bot${token()}/${method}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    return (await r.json()) as { ok: boolean; result?: T; description?: string };
  } catch (e) {
    return { ok: false, description: e instanceof Error ? e.message : "Gagal menghubungi Telegram." };
  }
}

// Teks dikirim sebagai HTML; isian dari pengguna wajib di-escape.
export const esc = (s: string | null | undefined) => (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function tgSend(chatId: string, html: string, opts: { buttons?: TgButton[][]; forceReply?: boolean; placeholder?: string } = {}) {
  return tgCall<{ message_id: number }>("sendMessage", {
    chat_id: chatId, text: html, parse_mode: "HTML", disable_web_page_preview: true,
    ...(opts.buttons ? { reply_markup: { inline_keyboard: opts.buttons.map((row) => row.map((b) => (b.url ? { text: b.text, url: b.url } : { text: b.text, callback_data: b.data }))) } } : {}),
    ...(opts.forceReply ? { reply_markup: { force_reply: true, input_field_placeholder: opts.placeholder ?? "" } } : {}),
  });
}

// Ubah pesan yang sudah terkirim (mis. setelah Setujui/Tolak) dan buang tombolnya.
export async function tgEdit(chatId: string | number, messageId: number, html: string) {
  return tgCall("editMessageText", { chat_id: chatId, message_id: messageId, text: html, parse_mode: "HTML", disable_web_page_preview: true });
}

export async function tgAnswer(callbackId: string, text: string, alert = false) {
  return tgCall("answerCallbackQuery", { callback_query_id: callbackId, text: text.slice(0, 190), show_alert: alert });
}

// Kirim ke banyak user sekaligus (hanya yang sudah menghubungkan Telegram). Tidak pernah melempar error.
export async function tgSendMany(chats: (string | null | undefined)[], html: string, buttons?: TgButton[][]) {
  if (!telegramOn()) return;
  await Promise.all([...new Set(chats.filter((c): c is string => !!c))].map((c) => tgSend(c, html, buttons ? { buttons } : {}).catch(() => null)));
}

// Alamat portal untuk tautan di pesan.
export const portalUrl = (path: string) => `${(process.env.NEXTAUTH_URL || process.env.AUTH_URL || "https://www.citrabanjar.com").replace(/\/$/, "")}${path}`;
