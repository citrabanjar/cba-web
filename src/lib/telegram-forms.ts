// Pengajuan langsung dari chat Telegram dengan tombol (keputusan pemilik 2026-11-21): ketik "menu" → pilih pengajuan →
// pilih tanggal (tombol) → ketik jam / alasan (membalas pesan bot) → ringkasan → Kirim. Tahap 1: Lupa Absen & Lembur.
// Tanpa tabel status percakapan: langkah sebelumnya dibawa di data tombol dan di penanda (#...) pada pesan yang dibalas.
// Pengirimannya lewat fungsi yang sama dengan portal (submitFixFor / submitOvertimeFor), jadi aturannya sama persis.
import { prisma } from "@/lib/prisma";
import { wibToday } from "@/lib/attendance-assess";
import { FIX_LIVE, submitFixFor } from "@/lib/attendance-fix";
import { submitOvertimeFor } from "@/lib/request-submit";
import { formatDate } from "@/lib/utils";
import { esc, tgAnswer, tgEdit, tgSend, type TgButton } from "@/lib/telegram";

type Who = { id: string; name: string | null };
const DAY = 86_400_000;
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const label = (s: string) => formatDate(new Date(`${s}T00:00:00Z`));
const hhmm = (s: string) => `${s.slice(0, 2)}:${s.slice(2)}`;
// "1730", "17.30", "17:30", "7:05" → "17:30" / "07:05"; selain itu null.
export function parseTime(raw: string) {
  const m = raw.trim().replace(/\s/g, "").match(/^(\d{1,2})[:.]?(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  return h <= 23 && mi <= 59 ? `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}` : null;
}
const ask = (chatId: string, html: string, tag: string, placeholder: string) =>
  tgSend(chatId, `${html}\n\n<i>Balas pesan ini.</i> ${tag}`, { forceReply: true, placeholder });

export async function sendFormMenu(chatId: string) {
  const buttons: TgButton[][] = [[{ text: "🕘 Lupa Absen", data: "m|fix" }, { text: "⏱️ Lembur", data: "m|ot" }]];
  await tgSend(chatId, "📝 <b>Pilih pengajuan</b>\nCuti, Pengajuan Absen, dan Dinas Luar menyusul; sementara lewat portal.", { buttons });
}

// ── Tombol ────────────────────────────────────────────────────────────────────────────────────────────────
// m|fix · m|ot (menu) · fd|<tgl> (Lupa Absen: tanggal) · od|<tgl> (Lembur: tanggal) · k|fx|<tgl>|<i/o>|<HHMM> · k|ot|<tgl>|<HHMM>|<HHMM> · x
export async function onFormButton(q: { id: string; data: string; message: { message_id: number; text?: string } }, chatId: string, who: Who) {
  const [k, ...p] = q.data.split("|");
  if (k === "x") {
    await tgAnswer(q.id, "Dibatalkan.");
    await tgEdit(chatId, q.message.message_id, `${esc(q.message.text ?? "")}\n\n✖️ Dibatalkan.`).catch(() => null);
    return true;
  }
  if (k === "m" && p[0] === "fix") { await tgAnswer(q.id, "Lupa Absen"); await fixDates(chatId, who); return true; }
  if (k === "m" && p[0] === "ot") { await tgAnswer(q.id, "Lembur"); await otDates(chatId); return true; }
  if (k === "fd" && p[0]) {
    await tgAnswer(q.id, label(p[0]));
    const att = await prisma.attendance.findUnique({ where: { userId_date: { userId: who.id, date: new Date(`${p[0]}T00:00:00Z`) } }, select: { checkIn: true } });
    const io = att?.checkIn ? "o" : "i";
    await ask(chatId, `🕘 Lupa Absen <b>${label(p[0])}</b>\nJam <b>${io === "i" ? "masuk" : "pulang"}</b> sebenarnya? (contoh 17:30)`, `#fx|${p[0]}|${io}`, "Contoh 17:30");
    return true;
  }
  if (k === "od" && p[0]) {
    await tgAnswer(q.id, label(p[0]));
    await ask(chatId, `⏱️ Lembur <b>${label(p[0])}</b>\nJam <b>mulai</b> lembur? (contoh 17:00)`, `#os|${p[0]}`, "Contoh 17:00");
    return true;
  }
  if (k === "k") {
    const reason = (q.message.text ?? "").match(/^Alasan: (.+)$/m)?.[1]?.trim() ?? "";
    let r: { error?: string; approver?: string };
    if (p[0] === "fx") r = await submitFixFor(who, { date: p[1], checkIn: p[2] === "i" ? hhmm(p[3]) : "", checkOut: p[2] === "o" ? hhmm(p[3]) : "", reason });
    else if (p[0] === "ot") r = await submitOvertimeFor(who, { date: p[1], startTime: hhmm(p[2]), endTime: hhmm(p[3]), reason });
    else return false;
    if (r.error) { await tgAnswer(q.id, r.error, true); return true; }
    await tgAnswer(q.id, "Terkirim.");
    await tgEdit(chatId, q.message.message_id, `${esc(q.message.text ?? "")}\n\n✅ <b>Terkirim</b>${r.approver ? ` ke ${esc(r.approver)}` : ""} untuk persetujuan.`).catch(() => null);
    return true;
  }
  return false;
}

// Lupa Absen: tanggal dengan absen belum lengkap (31 hari terakhir; hari ini bila belum check-in atau belum check-out),
// yang belum punya pengajuan berjalan.
async function fixDates(chatId: string, who: Who) {
  const today = wibToday();
  const since = new Date(today.getTime() - 31 * DAY);
  const [atts, fixes] = await Promise.all([
    prisma.attendance.findMany({ where: { userId: who.id, date: { gte: since, lte: today } }, orderBy: { date: "desc" }, select: { date: true, checkIn: true, checkOut: true, status: true } }),
    prisma.attendanceCorrection.findMany({ where: { userId: who.id, status: { in: FIX_LIVE }, date: { gte: since } }, select: { date: true } }),
  ]);
  const covered = new Set(fixes.map((f) => ymd(f.date)));
  const todayRow = atts.find((a) => a.date.getTime() === today.getTime());
  const dates = atts.filter((a) => a.date < today && !!a.checkIn !== !!a.checkOut).map((a) => ymd(a.date));
  // Hari ini: belum check-in (lupa masuk) atau sudah check-in tapi belum check-out.
  if (!todayRow || !todayRow.checkOut) if (!todayRow || !["CUTI", "DINAS", "IZIN", "SAKIT"].includes(todayRow.status)) dates.unshift(ymd(today));
  const list = [...new Set(dates)].filter((d) => !covered.has(d)).slice(0, 8);
  if (!list.length) { await tgSend(chatId, "✅ Tidak ada absen yang belum lengkap dalam 31 hari terakhir."); return; }
  const rows: TgButton[][] = [];
  for (let i = 0; i < list.length; i += 2) rows.push(list.slice(i, i + 2).map((d) => ({ text: d === ymd(today) ? `Hari ini ${label(d)}` : label(d), data: `fd|${d}` })));
  rows.push([{ text: "✖️ Batal", data: "x" }]);
  await tgSend(chatId, "🕘 <b>Lupa Absen</b>\nPilih tanggal yang absennya belum lengkap:", { buttons: rows });
}

async function otDates(chatId: string) {
  const today = wibToday();
  const d = (n: number) => ymd(new Date(today.getTime() + n * DAY));
  const rows: TgButton[][] = [
    [{ text: `Kemarin ${label(d(-1))}`, data: `od|${d(-1)}` }, { text: `Hari ini ${label(d(0))}`, data: `od|${d(0)}` }],
    [{ text: `Besok ${label(d(1))}`, data: `od|${d(1)}` }, { text: `Lusa ${label(d(2))}`, data: `od|${d(2)}` }],
    [{ text: "✖️ Batal", data: "x" }],
  ];
  await tgSend(chatId, "⏱️ <b>Lembur</b>\nPilih tanggal lembur:", { buttons: rows });
}

// ── Balasan teks (jam / alasan) ───────────────────────────────────────────────────────────────────────────
// #fx|tgl|io → jam · #fr|tgl|io|HHMM → alasan · #os|tgl → jam mulai · #oe|tgl|HHMM → jam selesai · #or|tgl|HHMM|HHMM → alasan
const TAG = /#(fx|fr|os|oe|or)\|([\d-]+)(?:\|([io\d]+))?(?:\|(\d{4}))?/;
export async function onFormReply(chatId: string, replyTo: string, text: string) {
  const m = replyTo.match(TAG);
  if (!m) return false;
  const [, k, date, a, b] = m;
  const time = () => parseTime(text);
  const bad = () => tgSend(chatId, "Format jam belum benar. Balas lagi pesan sebelumnya dengan contoh <b>17:30</b>.");
  if (k === "fx") {
    const t = time(); if (!t) { await bad(); return true; }
    await ask(chatId, `🕘 Lupa Absen <b>${label(date)}</b> · jam ${a === "i" ? "masuk" : "pulang"} <b>${t}</b>\nAlasan lupa absen?`, `#fr|${date}|${a}|${t.replace(":", "")}`, "Alasan");
    return true;
  }
  if (k === "os") {
    const t = time(); if (!t) { await bad(); return true; }
    await ask(chatId, `⏱️ Lembur <b>${label(date)}</b> · mulai <b>${t}</b>\nJam <b>selesai</b> lembur? (contoh 20:00)`, `#oe|${date}|${t.replace(":", "")}`, "Contoh 20:00");
    return true;
  }
  if (k === "oe") {
    const t = time(); if (!t) { await bad(); return true; }
    await ask(chatId, `⏱️ Lembur <b>${label(date)}</b> · ${hhmm(a)}–${t}\nKeperluan lembur?`, `#or|${date}|${a}|${t.replace(":", "")}`, "Keperluan");
    return true;
  }
  const reason = text.trim().slice(0, 500);
  if (!reason) return true;
  // Ringkasan + Kirim. Alasan dibaca kembali dari baris "Alasan:" pesan ini saat tombol Kirim ditekan.
  if (k === "fr") {
    await tgSend(chatId, `🕘 <b>Lupa Absen</b>\nTanggal: ${label(date)}\nJam ${a === "i" ? "masuk" : "pulang"}: ${hhmm(b)}\nAlasan: ${esc(reason.replace(/\n/g, " "))}`,
      { buttons: [[{ text: "✅ Kirim", data: `k|fx|${date}|${a}|${b}` }, { text: "✖️ Batal", data: "x" }]] });
    return true;
  }
  if (k === "or") {
    await tgSend(chatId, `⏱️ <b>Lembur</b>\nTanggal: ${label(date)}\nJam: ${hhmm(a)}–${hhmm(b)}\nAlasan: ${esc(reason.replace(/\n/g, " "))}`,
      { buttons: [[{ text: "✅ Kirim", data: `k|ot|${date}|${a}|${b}` }, { text: "✖️ Batal", data: "x" }]] });
    return true;
  }
  return false;
}
