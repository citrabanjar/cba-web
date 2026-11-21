// Kabar ke lonceng notifikasi karyawan (mis. pengajuan disetujui / ditolak).
// Gagal mencatat kabar tidak boleh menggagalkan keputusan yang sudah tersimpan.
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/utils";
import { esc, portalUrl, telegramOn, tgSendMany } from "@/lib/telegram";

// opts.telegram: kabar yang sama juga dikirim ke Telegram penerima yang sudah menghubungkan (Cuti, Pengajuan Absen, Lembur).
export async function notify(userIds: string | (string | null | undefined)[], title: string, body?: string | null, href?: string | null, opts: { telegram?: boolean } = {}) {
  const ids = [...new Set((Array.isArray(userIds) ? userIds : [userIds]).filter((x): x is string => !!x))];
  if (!ids.length) return;
  try {
    await prisma.notification.createMany({ data: ids.map((userId) => ({ userId, title, body: body || null, href: href || null })) });
  } catch {
    // diabaikan
  }
  if (opts.telegram && telegramOn()) {
    try {
      const chats = await prisma.user.findMany({ where: { id: { in: ids }, telegramChatId: { not: null } }, select: { telegramChatId: true } });
      await tgSendMany(chats.map((c) => c.telegramChatId), `<b>${esc(title)}</b>${body ? `\n${esc(body)}` : ""}${href ? `\n<a href="${portalUrl(href)}">Buka di portal</a>` : ""}`);
    } catch {
      // diabaikan
    }
  }
}

// "16-Nov-2026" atau "16-Nov-2026 – 19-Nov-2026".
export const dateRange = (a: Date, b: Date) => `${formatDate(a)}${a.getTime() === b.getTime() ? "" : ` – ${formatDate(b)}`}`;

// Kalimat keputusan: "disetujui oleh X" / "ditolak oleh X: alasan".
export const decisionText = (approve: boolean, by: string | null | undefined, note?: string | null) =>
  `${approve ? "Disetujui" : "Ditolak"}${by ? ` oleh ${by}` : ""}${!approve && note?.trim() ? `: ${note.trim()}` : ""}.`;
