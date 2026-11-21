// Telegram: kirim pengajuan Cuti / Pengajuan Absen / Dinas Luar / Lembur / Lupa Absen ke penyetuju dengan tombol
// Setujui / Tolak, lalu proses klik tombol dari webhook (keputusan pemilik 2026-11-21: Telegram opsional, persetujuan
// langsung dari Telegram). Keputusannya lewat lib/decide-requests, jadi aturannya sama persis dengan menu Persetujuan.
import { prisma } from "@/lib/prisma";
import { actionableApprovers, readApproval } from "@/lib/onboarding-interview";
import { dateRange } from "@/lib/notify";
import { hmWib } from "@/lib/attendance-fix";
import { esc, portalUrl, telegramOn, tgAnswer, tgEdit, tgSend, type TgButton } from "@/lib/telegram";

export type TgKind = "leave" | "trip" | "overtime" | "fix";
const KINDS: TgKind[] = ["leave", "trip", "overtime", "fix"];
const isKind = (k: string): k is TgKind => (KINDS as string[]).includes(k);

type Pending = { userId: string; approval: unknown; html: string };

// Ringkasan pengajuan yang masih menunggu (null = tidak ada / sudah diputus).
async function load(kind: TgKind, id: string): Promise<Pending | null> {
  if (kind === "leave") {
    const r = await prisma.leaveRequest.findUnique({ where: { id }, include: { user: { select: { name: true } }, policy: { select: { name: true } } } });
    if (!r || r.status !== "PENDING") return null;
    const what = r.urgent ? `Pengajuan Absen · ${r.policy?.name ?? "Cuti"}` : r.policy?.name ?? "Cuti";
    return { userId: r.userId, approval: r.approval, html: `<b>${esc(what)}</b>\n${esc(r.user.name)}\n${esc(dateRange(r.startDate, r.endDate))} · ${r.totalDays} hari\nAlasan: ${esc(r.reason)}` };
  }
  if (kind === "trip") {
    const r = await prisma.businessTrip.findUnique({ where: { id }, include: { user: { select: { name: true } } } });
    if (!r || r.status !== "PENDING") return null;
    return { userId: r.userId, approval: r.approval, html: `<b>Dinas Luar</b>\n${esc(r.user.name)}\n${esc(dateRange(r.startDate, r.endDate))} · ${esc(r.destination)}\nKeperluan: ${esc(r.purpose)}` };
  }
  if (kind === "overtime") {
    const r = await prisma.overtime.findUnique({ where: { id }, include: { user: { select: { name: true } } } });
    if (!r || r.status !== "PENDING") return null;
    return { userId: r.userId, approval: r.approval, html: `<b>Lembur</b>\n${esc(r.user.name)}\n${esc(dateRange(r.date, r.date))} · ${esc(r.startTime)}–${esc(r.endTime)}\nAlasan: ${esc(r.reason)}` };
  }
  const r = await prisma.attendanceCorrection.findUnique({ where: { id }, include: { user: { select: { name: true } } } });
  if (!r || r.status !== "PENDING") return null;
  const jam = [r.checkIn && `masuk ${hmWib(r.checkIn)}`, r.checkOut && `pulang ${hmWib(r.checkOut)}`].filter(Boolean).join(" · ");
  return { userId: r.userId, approval: r.approval, html: `<b>Lupa Absen</b>\n${esc(r.user.name)}\n${esc(dateRange(r.date, r.date))} · ${esc(jam)}\nAlasan: ${esc(r.reason)}` };
}

// Penyetuju yang sedang bergiliran: level Workflow yang berjalan, atau atasan langsung yang aktif.
async function approverIds(p: Pending) {
  const flow = readApproval(p.approval);
  if (flow) return actionableApprovers(flow);
  const u = await prisma.user.findUnique({ where: { id: p.userId }, select: { managerId: true, manager: { select: { isActive: true } } } });
  return u?.managerId && u.manager?.isActive ? [u.managerId] : [];
}

const buttons = (kind: TgKind, id: string): TgButton[][] => [[{ text: "✅ Setujui", data: `a|${kind}|${id}` }, { text: "❌ Tolak", data: `r|${kind}|${id}` }]];

// Kirim pengajuan ke penyetuju yang sudah menghubungkan Telegram. Tidak pernah melempar error.
export async function askApprovers(kind: TgKind, id: string) {
  if (!telegramOn()) return;
  try {
    const p = await load(kind, id);
    if (!p) return;
    const ids = await approverIds(p);
    if (!ids.length) return;
    const chats = await prisma.user.findMany({ where: { id: { in: ids }, isActive: true, telegramChatId: { not: null } }, select: { telegramChatId: true } });
    const html = `🔔 <b>Menunggu persetujuan Anda</b>\n\n${p.html}\n\n<a href="${portalUrl("/portal/persetujuan")}">Buka di portal</a>`;
    await Promise.all(chats.map((c) => tgSend(c.telegramChatId!, html, { buttons: buttons(kind, id) }).catch(() => null)));
  } catch {
    // diabaikan
  }
}

// ── Webhook ────────────────────────────────────────────────────────────────────────────────────────────────
type TgUser = { id: number; first_name?: string };
type TgMessage = { message_id: number; chat: { id: number; type: string }; from?: TgUser; text?: string; reply_to_message?: TgMessage };
type TgCallback = { id: string; from: TgUser; data?: string; message?: TgMessage };
export type TgUpdate = { update_id: number; message?: TgMessage; callback_query?: TgCallback };

const actorOf = (chatId: string) =>
  prisma.user.findFirst({ where: { telegramChatId: chatId, isActive: true }, select: { id: true, name: true, role: true } });

// Keputusan lewat modul bersama (import dinamis supaya tidak saling memanggil saat modul dimuat).
async function decide(kind: TgKind, actor: { id: string; name: string | null; role: string }, id: string, approve: boolean, note: string) {
  const d = await import("@/lib/decide-requests");
  const fn = { leave: d.decideLeaveAs, trip: d.decideTripAs, overtime: d.decideOvertimeAs, fix: d.decideFixAs }[kind];
  return fn(actor, id, approve, note);
}

const REJECT_TAG = /#tolak-(leave|trip|overtime|fix)-([a-z0-9]+)-(\d+)/;

export async function handleTelegramUpdate(u: TgUpdate) {
  if (u.callback_query) return onButton(u.callback_query);
  const m = u.message;
  if (!m?.text || m.chat.type !== "private") return;
  const chatId = String(m.chat.id);
  const text = m.text.trim();

  if (text.startsWith("/start")) {
    const code = text.slice(6).trim();
    if (!code) {
      await tgSend(chatId, "Halo! Bot ini untuk notifikasi dan persetujuan pengajuan portal PT. Citra Banjar Abadi.\n\nUntuk menghubungkan akun Anda, buka portal → <b>Profil Saya → Akun → Hubungkan Telegram</b>.");
      return;
    }
    const user = await prisma.user.findFirst({ where: { telegramLinkCode: code, telegramLinkExpires: { gt: new Date() }, isActive: true }, select: { id: true, name: true } });
    if (!user) { await tgSend(chatId, "Kode tidak berlaku atau sudah kedaluwarsa. Buat tautan baru di portal → Profil Saya → Akun → Hubungkan Telegram."); return; }
    // Satu chat hanya untuk satu akun: lepaskan dari akun lain lebih dulu.
    await prisma.$transaction([
      prisma.user.updateMany({ where: { telegramChatId: chatId, id: { not: user.id } }, data: { telegramChatId: null } }),
      prisma.user.update({ where: { id: user.id }, data: { telegramChatId: chatId, telegramLinkCode: null, telegramLinkExpires: null } }),
    ]);
    await tgSend(chatId, `✅ Terhubung sebagai <b>${esc(user.name)}</b>.\nPengajuan Cuti, Pengajuan Absen, Dinas Luar, Lembur, dan Lupa Absen yang perlu Anda putuskan, serta hasil pengajuan Anda, akan dikirim ke sini.\n\nKetik /putus untuk melepas.`);
    return;
  }
  if (text === "/putus" || text === "/stop") {
    const r = await prisma.user.updateMany({ where: { telegramChatId: chatId }, data: { telegramChatId: null } });
    await tgSend(chatId, r.count ? "Telegram sudah dilepas dari akun portal. Anda tidak akan menerima notifikasi lagi." : "Chat ini belum terhubung ke akun portal.");
    return;
  }

  // Balasan alasan penolakan (menjawab pesan "Tulis alasan penolakan ... #tolak-<jenis>-<id>-<pesan>").
  const tag = m.reply_to_message?.text?.match(REJECT_TAG);
  if (tag) {
    const actor = await actorOf(chatId);
    if (!actor) { await tgSend(chatId, "Chat ini belum terhubung ke akun portal."); return; }
    const [, kind, id, msgId] = tag;
    if (!isKind(kind)) return;
    const before = await load(kind, id);
    const r = await decide(kind, actor, id, false, text);
    if (r.error) { await tgSend(chatId, `⚠️ ${esc(r.error)}`); return; }
    if (before) await tgEdit(chatId, Number(msgId), `${before.html}\n\n❌ <b>Ditolak</b> oleh ${esc(actor.name)}: ${esc(text)}`).catch(() => null);
    await tgSend(chatId, "❌ Pengajuan ditolak. Pemohon sudah diberi tahu.");
    return;
  }
  await tgSend(chatId, "Gunakan tombol <b>Setujui</b> / <b>Tolak</b> pada pesan pengajuan. Untuk melepas akun ketik /putus.");
}

async function onButton(q: TgCallback) {
  const [act, kind, id] = (q.data ?? "").split("|");
  const msg = q.message;
  if (!msg || !id || !isKind(kind) || (act !== "a" && act !== "r")) { await tgAnswer(q.id, "Tombol tidak dikenal."); return; }
  const chatId = String(msg.chat.id);
  const actor = await actorOf(chatId);
  if (!actor) { await tgAnswer(q.id, "Chat ini belum terhubung ke akun portal.", true); return; }
  const p = await load(kind, id);
  if (!p) {
    await tgAnswer(q.id, "Pengajuan sudah diputus atau dibatalkan.", true);
    await tgEdit(chatId, msg.message_id, `${esc(msg.text ?? "")}\n\nℹ️ Sudah diputus / dibatalkan.`).catch(() => null);
    return;
  }
  if (act === "r") {
    // Alasan wajib: minta dibalas. Penanda di akhir pesan dipakai untuk mengenali balasannya.
    await tgAnswer(q.id, "Tulis alasan penolakan.");
    await tgSend(chatId, `Tulis alasan penolakan untuk pengajuan ${esc(p.html.split("\n")[1] ?? "")} dengan <b>membalas pesan ini</b>.\n\n#tolak-${kind}-${id}-${msg.message_id}`,
      { forceReply: true, placeholder: "Alasan penolakan" });
    return;
  }
  const r = await decide(kind, actor, id, true, "");
  if (r.error) { await tgAnswer(q.id, r.error, true); return; }
  await tgAnswer(q.id, "Disetujui.");
  await tgEdit(chatId, msg.message_id, `${p.html}\n\n✅ <b>Disetujui</b> oleh ${esc(actor.name)}`).catch(() => null);
}
