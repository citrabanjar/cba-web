// Pengajuan langsung dari chat Telegram dengan tombol (keputusan pemilik 2026-11-21): ketik "menu" → pilih pengajuan →
// pilih / ketik isian (kolom ketik otomatis membalas pertanyaan bot) → ringkasan → Kirim. Menu sama dengan Tombol HP:
// Absensi (Live Location), Pengajuan Absen (Lupa Absen · Tidak Masuk potong Cuti Tahunan / Izin Tanpa Hak Cuti), Lembur,
// Cuti, Dinas Luar, Tukar Shift.
// Tanpa tabel status percakapan: langkah sebelumnya dibawa di data tombol dan di penanda tersembunyi pada pesan bot.
// Pengirimannya lewat fungsi yang sama dengan portal, jadi aturannya (saldo, H-x, bentrok tanggal, periode final,
// penyetuju / Workflow) sama persis.
import { createHmac } from "crypto";
import { prisma } from "@/lib/prisma";
import { openAttendance, wibToday } from "@/lib/attendance-assess";
import { FIX_LIVE, hmWib, submitFixFor } from "@/lib/attendance-fix";
import { clockInFor, clockOutFor } from "@/lib/clock";
import { swapShifts } from "@/lib/shift-swap";
import { createLeave, submitAbsenceFor, submitOvertimeFor, submitSwapFor, submitTripFor } from "@/lib/request-submit";
import { eligible, hasBalance, todayDate, visibleBalances } from "@/lib/leave-balance";
import { isPersonApprover } from "@/lib/delegation";
import { formatDate } from "@/lib/utils";
import { esc, telegramSecret, tgAnswer, tgDownload, tgEdit, tgSend, type TgButton } from "@/lib/telegram";

type Who = { id: string; name: string | null; role?: string };
type Entity = { type: string; url?: string };
export type TgMedia = { fileId: string; mime: string; size: number; name: string };
const DAY = 86_400_000;
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const label = (s: string) => formatDate(new Date(`${s}T00:00:00Z`));
const hhmm = (s: string) => `${s.slice(0, 2)}:${s.slice(2)}`;
// Tanggal ringkas di data tombol (batas 64 byte): 20261121 ↔ 2026-11-21.
const d8 = (s: string) => s.replace(/-/g, "");
const dash = (s: string) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
const fmtDays = (n: number) => String(n).replace(".", ",");

// "1730", "17.30", "17:30", "7:05" → "17:30" / "07:05"; selain itu null.
export function parseTime(raw: string) {
  const m = raw.trim().replace(/\s/g, "").match(/^(\d{1,2})[:.]?(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  return h <= 23 && mi <= 59 ? `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}` : null;
}
// "3-12-2026", "03/12/2026", "3.12", "3 12" → "2026-12-03". Tanpa tahun: tahun ini (atau tahun depan bila sudah lewat > 60 hari).
export function parseDate(raw: string) {
  const m = raw.trim().match(/^(\d{1,2})[-/. ](\d{1,2})(?:[-/. ](\d{2,4}))?$/);
  if (!m) return null;
  const today = wibToday();
  let y = m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : today.getUTCFullYear();
  const mo = Number(m[2]), d = Number(m[1]);
  let dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  if (!m[3] && dt.getTime() < today.getTime() - 60 * DAY) { y += 1; dt = new Date(Date.UTC(y, mo - 1, d)); }
  return ymd(dt);
}

// Penanda langkah disembunyikan di tautan tak terlihat (spasi nol-lebar) supaya pesan tetap bersih; saat karyawan
// mengetik jawaban, penanda dibaca dari entitas tautan pesan yang dibalas.
const TAG_URL = "https://www.citrabanjar.com/tg#";
const hidden = (tag: string) => `<a href="${TAG_URL}${encodeURIComponent(tag)}">​</a>`;
const ask = (chatId: string, html: string, tag: string, placeholder: string) =>
  tgSend(chatId, `${html}${hidden(tag)}`, { forceReply: true, placeholder });
function tagOf(msg: { text?: string; entities?: Entity[] } | undefined) {
  const url = msg?.entities?.find((e) => e.type === "text_link" && e.url?.startsWith(TAG_URL))?.url;
  return url ? decodeURIComponent(url.slice(TAG_URL.length)) : msg?.text ?? "";
}
// Penanda dari pesan yang dibalas: tautan tersembunyi (baru) atau teks "#..." (pesan lama).
export const replyTag = tagOf;
export const FORM_TAG = /#(fx|fr|os|oe|or|ar|tt|tp|ls|le|lr|lf|sd|sn|sr)\|/;
const line = (text: string | undefined, key: string) => (text ?? "").match(new RegExp(`^${key}: (.+)$`, "m"))?.[1]?.trim() ?? "";
const clean = (s: string, max = 500) => s.replace(/[\n|]/g, " ").trim().slice(0, max);

export async function sendFormMenu(chatId: string) {
  const buttons: TgButton[][] = [
    [{ text: "📍 Absensi", data: "m|att" }, { text: "🕘 Pengajuan Absen", data: "m|abs" }],
    [{ text: "⏱️ Lembur", data: "m|ot" }, { text: "🗓️ Cuti", data: "m|lv" }],
    [{ text: "🚗 Dinas Luar", data: "m|tr" }, { text: "🔄 Tukar Shift", data: "m|sw" }],
  ];
  await tgSend(chatId, "📝 <b>Pilih menu</b>", { buttons });
}

const cancelRow: TgButton[] = [{ text: "✖️ Batal", data: "x" }];
const pairs = (list: TgButton[]) => { const rows: TgButton[][] = []; for (let i = 0; i < list.length; i += 2) rows.push(list.slice(i, i + 2)); return rows; };
const dayButtons = (dates: string[], data: (d: string) => string, today: string) =>
  pairs(dates.map((d) => ({ text: d === today ? `Hari ini ${label(d)}` : label(d), data: data(d) })));

// ── Tombol ────────────────────────────────────────────────────────────────────────────────────────────────
// m|abs · m|fix · m|ot · m|lv · m|tr (menu)
// fd|tgl (Lupa Absen) · od|tgl (Lembur) · ab|T/U → as|K|mulai → ae|K|mulai|selesai (Tidak Masuk)
// ts|mulai → te|mulai|selesai (Dinas Luar) · lp|policyId (Cuti) · k|... (Kirim) · x (Batal)
// m|att (Absensi) · cw|i/o|lat|lng|waktu|tanda (tetap absen setelah peringatan)
// m|sw → sd|tgl (atau ketik #sd) → ketik nama rekan #sn → sp|tgl|rekan → alasan #sr (Tukar Shift)
type Q = { id: string; data: string; message: { message_id: number; text?: string; entities?: Entity[] } };
export async function onFormButton(q: Q, chatId: string, who: Who) {
  const [k, ...p] = q.data.split("|");
  const today = ymd(wibToday());
  if (k === "x") {
    await tgAnswer(q.id, "Dibatalkan.");
    await tgEdit(chatId, q.message.message_id, `${esc(q.message.text ?? "")}\n\n✖️ Dibatalkan.`).catch(() => null);
    return true;
  }
  if (k === "m") {
    await tgAnswer(q.id, "");
    if ((p[0] === "att" || p[0] === "sw") && who.role === "SUPER_ADMIN") await tgSend(chatId, "ℹ️ Menu ini untuk karyawan; akun Super Admin tidak absen dan tidak punya jadwal shift.");
    else if (p[0] === "att") await attendanceStatus(chatId, who);
    else if (p[0] === "sw") await swapDates(chatId);
    else if (p[0] === "abs") await absenceMenu(chatId, who);
    else if (p[0] === "fix") await fixDates(chatId, who);
    else if (p[0] === "ot") await otDates(chatId);
    else if (p[0] === "lv") await leaveTypes(chatId, who);
    else if (p[0] === "tr") {
      const days = Array.from({ length: 8 }, (_, i) => ymd(new Date(wibToday().getTime() + i * DAY)));
      await tgSend(chatId, "🚗 <b>Dinas Luar</b>\nTanggal <b>mulai</b> dinas:", { buttons: [...dayButtons(days, (d) => `ts|${d8(d)}`, today), cancelRow] });
    } else return false;
    return true;
  }
  if (k === "fd" && p[0]) {
    await tgAnswer(q.id, label(p[0]));
    const att = await prisma.attendance.findUnique({ where: { userId_date: { userId: who.id, date: new Date(`${p[0]}T00:00:00Z`) } }, select: { checkIn: true } });
    const io = att?.checkIn ? "o" : "i";
    await ask(chatId, `🕘 Lupa Absen <b>${label(p[0])}</b>\nJam <b>${io === "i" ? "masuk" : "pulang"}</b> sebenarnya?`, `#fx|${p[0]}|${io}`, "Contoh 17:30");
    return true;
  }
  if (k === "od" && p[0]) {
    await tgAnswer(q.id, label(p[0]));
    await ask(chatId, `⏱️ Lembur <b>${label(p[0])}</b>\nJam <b>mulai</b> lembur?`, `#os|${p[0]}`, "Contoh 17:00");
    return true;
  }
  // Tidak Masuk: tanggal mulai (hari ini s/d 6 hari lalu) → tanggal selesai (mulai s/d hari ini) → alasan.
  if (k === "ab" && (p[0] === "T" || p[0] === "U")) {
    await tgAnswer(q.id, "");
    // Potong Cuti: cek sisa saldo dulu (seperti di portal). Saldo habis / belum ada → arahkan ke Izin Tanpa Hak Cuti.
    let info = "";
    if (p[0] === "T") {
      const sisa = await annualAvailable(who);
      if (!sisa) {
        await tgSend(chatId, `⚠️ Sisa saldo Cuti Tahunan Anda <b>${sisa === null ? "belum tersedia" : "0 hari"}</b>, jadi tidak bisa potong cuti.\nAjukan sebagai Izin Tanpa Hak Cuti?`,
          { buttons: [[{ text: "Izin Tanpa Hak Cuti", data: "ab|U" }], cancelRow] });
        return true;
      }
      info = `\nSisa saldo Cuti Tahunan: <b>${fmtDays(sisa)} hari</b>.`;
    }
    const days = Array.from({ length: 7 }, (_, i) => ymd(new Date(wibToday().getTime() - i * DAY)));
    await tgSend(chatId, `🕘 <b>Tidak Masuk · ${p[0] === "T" ? "Potong Cuti Tahunan" : "Izin Tanpa Hak Cuti"}</b>${info}\nTidak masuk <b>mulai</b> tanggal:\n<i>Lebih dari 7 hari lalu: lewat portal.</i>`,
      { buttons: [...dayButtons(days, (d) => `as|${p[0]}|${d8(d)}`, today), cancelRow] });
    return true;
  }
  if (k === "as" && p[1]) {
    await tgAnswer(q.id, label(dash(p[1])));
    const days: string[] = [];
    for (let t = new Date(`${dash(p[1])}T00:00:00Z`).getTime(); t <= wibToday().getTime() && days.length < 8; t += DAY) days.push(ymd(new Date(t)));
    await tgSend(chatId, `🕘 Tidak masuk mulai <b>${label(dash(p[1]))}</b>\n<b>Sampai</b> tanggal:`, { buttons: [...dayButtons(days, (d) => `ae|${p[0]}|${p[1]}|${d8(d)}`, today), cancelRow] });
    return true;
  }
  if (k === "ae" && p[2]) {
    await tgAnswer(q.id, "");
    await ask(chatId, `🕘 Tidak masuk <b>${label(dash(p[1]))}${p[1] === p[2] ? "" : ` – ${label(dash(p[2]))}`}</b>\nAlasan tidak masuk?`, `#ar|${p[0]}|${p[1]}|${p[2]}`, "Alasan");
    return true;
  }
  // Dinas Luar: tanggal mulai → selesai (mulai s/d 7 hari) → tujuan → keperluan.
  if (k === "ts" && p[0]) {
    await tgAnswer(q.id, label(dash(p[0])));
    const s = new Date(`${dash(p[0])}T00:00:00Z`).getTime();
    const days = Array.from({ length: 8 }, (_, i) => ymd(new Date(s + i * DAY)));
    await tgSend(chatId, `🚗 Dinas mulai <b>${label(dash(p[0]))}</b>\n<b>Sampai</b> tanggal:`, { buttons: [...dayButtons(days, (d) => `te|${p[0]}|${d8(d)}`, today), cancelRow] });
    return true;
  }
  if (k === "te" && p[1]) {
    await tgAnswer(q.id, "");
    await ask(chatId, `🚗 Dinas <b>${label(dash(p[0]))}${p[0] === p[1] ? "" : ` – ${label(dash(p[1]))}`}</b>\nTujuan dinas?`, `#tt|${p[0]}|${p[1]}`, "Kota / lokasi tujuan");
    return true;
  }
  // Cuti: jenis → tanggal mulai (ketik) → tanggal selesai (ketik) → alasan → (lampiran bila wajib).
  if (k === "lp" && p[0]) {
    await tgAnswer(q.id, "");
    const policy = await prisma.leavePolicy.findUnique({ where: { id: p[0] }, select: { name: true, category: true, noticeDays: true } });
    if (!policy) return true;
    // Cuti Tahunan penyetuju wajib memilih delegasi; pilihan karyawan terlalu panjang untuk tombol Telegram.
    if (policy.category === "TAHUNAN" && (await isPersonApprover(who.id))) {
      await tgSend(chatId, "ℹ️ Anda memegang hak persetujuan, jadi Cuti Tahunan perlu memilih delegasi tanggung jawab. Ajukan lewat portal → Cuti.");
      return true;
    }
    await ask(chatId, `🗓️ <b>${esc(policy.name)}</b>${policy.noticeDays > 0 ? `\n<i>Diajukan paling lambat ${policy.noticeDays} hari sebelumnya.</i>` : ""}\nTanggal <b>mulai</b> cuti?`, `#ls|${p[0]}`, "Contoh 03-12-2026");
    return true;
  }
  // Absen setelah peringatan (terlambat / pulang awal): lokasi dibawa di tombol, ditandatangani supaya tidak bisa dipalsukan.
  if (k === "cw" && p.length === 5) {
    const [io, lat, lng, ts, sig] = p;
    if (sig !== clockSig(chatId, io, lat, lng, ts)) { await tgAnswer(q.id, "Tombol tidak berlaku.", true); return true; }
    if (Date.now() / 1000 - parseInt(ts, 36) > 300) {
      await tgAnswer(q.id, "Sudah lebih dari 5 menit. Bagikan Live Location lagi.", true);
      await tgEdit(chatId, q.message.message_id, `${esc(q.message.text ?? "")}\n\n⌛ Kedaluwarsa. Bagikan Live Location lagi.`).catch(() => null);
      return true;
    }
    const r = io === "o" ? await clockOutFor(who.id, Number(lat), Number(lng), true) : await clockInFor(who.id, Number(lat), Number(lng), true);
    if (r.error) { await tgAnswer(q.id, r.error, true); return true; }
    await tgAnswer(q.id, "Tercatat.");
    await tgEdit(chatId, q.message.message_id, clockDone(io, r)).catch(() => null);
    return true;
  }
  // Tukar Shift.
  if (k === "sd" && p[0] === "lain") {
    await tgAnswer(q.id, "");
    await ask(chatId, "🔄 <b>Tukar Shift</b>\nTanggal tukar shift?", "#sd|", "Contoh 03-12-2026");
    return true;
  }
  if (k === "sd" && p[0]) { await tgAnswer(q.id, label(dash(p[0]))); await askPartner(chatId, who, p[0]); return true; }
  if (k === "sp" && p[1]) {
    await tgAnswer(q.id, "");
    const date = new Date(`${dash(p[0])}T00:00:00Z`);
    const [partner, s] = await Promise.all([
      prisma.user.findUnique({ where: { id: p[1] }, select: { name: true } }),
      swapShifts(who.id, p[1], date),
    ]);
    if (!partner) return true;
    const err = "error" in s.a ? `Jadwal Anda: ${s.a.error}.` : "error" in s.b ? `Jadwal rekan: ${s.b.error}.` : s.a.code === s.b.code ? "Shift Anda dan rekan sama, tidak perlu ditukar." : "";
    if (err) { await tgSend(chatId, `⚠️ ${esc(err)}`, { buttons: [[{ text: "Pilih rekan lain", data: `sd|${p[0]}` }], cancelRow] }); return true; }
    await ask(chatId, `🔄 Tukar shift <b>${label(dash(p[0]))}</b> dengan <b>${esc(partner.name)}</b>\nAnda: ${esc(shiftText(s.a))} → ${esc(shiftText(s.b))}\nAlasan tukar shift?`, `#sr|${p[0]}|${p[1]}`, "Alasan");
    return true;
  }
  if (k === "k") return submit(q, chatId, who, p);
  return false;
}

// ── Absensi (Live Location) ───────────────────────────────────────────────────────────────────────────────
type Shift = Awaited<ReturnType<typeof swapShifts>>["a"];
const shiftText = (s: Shift) => ("error" in s ? "belum ada jadwal" : `${s.name || s.code}${"start" in s && s.start ? ` (${s.start}–${s.end})` : ""}`);
const clockSig = (chatId: string, io: string, lat: string, lng: string, ts: string) =>
  createHmac("sha256", telegramSecret() || "cba").update(`${chatId}|${io}|${lat}|${lng}|${ts}`).digest("base64url").slice(0, 12);
function clockDone(io: string, r: { location?: string | null; address?: string }) {
  const where = r.location ? `${esc(r.location)}${r.address ? `\n<i>${esc(r.address)}</i>` : ""}` : esc(r.address ?? "");
  return `✅ <b>Absen ${io === "o" ? "pulang" : "masuk"} tercatat</b> pukul ${hmWib(new Date())} WIB\n📍 ${where}\n\nLive Location boleh dihentikan sekarang.`;
}
const LIVE_HOW = "Bagikan <b>Live Location</b> dari HP: 📎 → <b>Lokasi</b> → <b>Bagikan Lokasi Langsung</b> (Share My Live Location).\n<i>Lokasi biasa / titik yang dipilih di peta tidak diterima.</i>";

async function attendanceStatus(chatId: string, who: Who) {
  const today = wibToday();
  const [open, s] = await Promise.all([openAttendance(who.id), swapShifts(who.id, who.id, today)]);
  const day = today.toLocaleDateString("id-ID", { weekday: "long", timeZone: "UTC" });
  const head = `📍 <b>Absensi</b> · ${day}, ${label(ymd(today))}\nShift: ${esc(shiftText(s.a))}`;
  const times = open ? `\nMasuk: ${open.checkIn ? hmWib(open.checkIn) : "--:--"} · Pulang: ${open.checkOut ? hmWib(open.checkOut) : "--:--"}${open.date.getTime() !== today.getTime() ? ` (shift ${label(ymd(open.date))})` : ""}` : "";
  if (open?.checkIn && open.checkOut) { await tgSend(chatId, `${head}${times}\n\n✅ Absen hari ini sudah lengkap.`); return; }
  const next = open?.checkIn ? "pulang" : "masuk";
  await tgSend(chatId, `${head}${times}\n\nUntuk absen <b>${next}</b>: ${LIVE_HOW}`);
}

// Lokasi yang dikirim karyawan: hanya Live Location asli (bukan diteruskan, bukan lokasi statis / titik peta).
export async function onLocation(chatId: string, who: Who, loc: { latitude: number; longitude: number; live_period?: number; forwarded: boolean; sentAt: number }) {
  if (who.role === "SUPER_ADMIN") { await tgSend(chatId, "ℹ️ Akun Super Admin tidak absen."); return; }
  if (loc.forwarded || !loc.live_period) { await tgSend(chatId, `⚠️ Absen hanya bisa dengan Live Location.\n${LIVE_HOW}`); return; }
  if (loc.sentAt && Date.now() / 1000 - loc.sentAt > 120) return; // pesan lama yang terlambat sampai: diabaikan
  const open = await openAttendance(who.id);
  const io = open?.checkIn && !open.checkOut ? "o" : "i";
  const r = io === "o" ? await clockOutFor(who.id, loc.latitude, loc.longitude) : await clockInFor(who.id, loc.latitude, loc.longitude);
  if (r.error) { await tgSend(chatId, `⚠️ ${esc(r.error)}`); return; }
  if (r.warn) {
    const lat = loc.latitude.toFixed(6), lng = loc.longitude.toFixed(6), ts = Math.floor(Date.now() / 1000).toString(36);
    await tgSend(chatId, `⚠️ ${esc(r.warn)}`, { buttons: [[{ text: `✅ Tetap absen ${io === "o" ? "pulang" : "masuk"}`, data: `cw|${io}|${lat}|${lng}|${ts}|${clockSig(chatId, io, lat, lng, ts)}` }], cancelRow] });
    return;
  }
  await tgSend(chatId, clockDone(io, r));
}

// ── Tukar Shift ───────────────────────────────────────────────────────────────────────────────────────────
async function swapDates(chatId: string) {
  const t = wibToday().getTime();
  const days = Array.from({ length: 6 }, (_, i) => ymd(new Date(t + i * DAY)));
  await tgSend(chatId, "🔄 <b>Tukar Shift</b>\nTanggal tukar shift:", { buttons: [...dayButtons(days, (d) => `sd|${d8(d)}`, ymd(new Date(t))), [{ text: "📅 Tanggal lain", data: "sd|lain" }], cancelRow] });
}

async function askPartner(chatId: string, who: Who, date8: string) {
  const s = await swapShifts(who.id, who.id, new Date(`${dash(date8)}T00:00:00Z`));
  await ask(chatId, `🔄 Tukar shift <b>${label(dash(date8))}</b>\nShift Anda: ${esc(shiftText(s.a))}\nKetik <b>nama</b> atau <b>NIK</b> rekan:`, `#sn|${date8}`, "Nama / NIK rekan");
}

async function submit(q: Q, chatId: string, who: Who, p: string[]) {
  const text = q.message.text ?? "";
  const reason = line(text, "Alasan");
  let r: { error?: string; approver?: string };
  if (p[0] === "fx") r = await submitFixFor(who, { date: p[1], checkIn: p[2] === "i" ? hhmm(p[3]) : "", checkOut: p[2] === "o" ? hhmm(p[3]) : "", reason });
  else if (p[0] === "ot") r = await submitOvertimeFor(who, { date: p[1], startTime: hhmm(p[2]), endTime: hhmm(p[3]), reason });
  else if (p[0] === "ab") r = await submitAbsenceFor(who, { kind: p[1] === "T" ? "TAHUNAN" : "TANPA_UPAH", startDate: dash(p[2]), endDate: dash(p[3]), reason });
  else if (p[0] === "tr") r = await submitTripFor(who, { destination: line(text, "Tujuan"), purpose: line(text, "Keperluan"), startDate: dash(p[1]), endDate: dash(p[2]) });
  else if (p[0] === "lv") {
    // Lampiran (foto / PDF) dikirim ulang dari Telegram saat Kirim ditekan; id berkasnya ada di penanda pesan ringkasan.
    const file = tagOf(q.message).match(/^#lx\|([^|]+)\|([^|]+)\|(.*)$/);
    const files = [];
    if (file) {
      const data = await tgDownload(file[1]);
      if (!data) { await tgAnswer(q.id, "Lampiran gagal diambil dari Telegram. Kirim ulang fotonya.", true); return true; }
      files.push({ name: file[3] || "lampiran", mime: file[2], data });
    }
    const c = await createLeave(who.id, { policyId: p[1], startDate: dash(p[2]), endDate: dash(p[3]), reason, dayPart: "PENUH", delegateId: "", files });
    r = "error" in c && c.error ? { error: c.error } : { approver: "approver" in c ? c.approver : undefined };
  } else if (p[0] === "sw") {
    r = await submitSwapFor(who, { date: dash(p[1]), partnerId: p[2], reason });
    if (!r.error) {
      await tgAnswer(q.id, "Terkirim.");
      await tgEdit(chatId, q.message.message_id, `${esc(text)}\n\n✅ <b>Terkirim</b> ke ${esc(line(text, "Rekan"))}. Setelah rekan menerima, diteruskan ke atasan langsung.`).catch(() => null);
      return true;
    }
  } else return false;
  if (r.error) { await tgAnswer(q.id, r.error, true); return true; }
  await tgAnswer(q.id, "Terkirim.");
  await tgEdit(chatId, q.message.message_id, `${esc(text)}\n\n✅ <b>Terkirim</b>${r.approver ? ` ke ${esc(r.approver)}` : ""} untuk persetujuan.`).catch(() => null);
  return true;
}

// Sisa Cuti Tahunan yang bisa dipakai (sama dengan halaman Pengajuan Absen di portal): saldo dikurangi pengajuan
// yang masih menunggu. null = saldo belum tersedia / belum bisa dihitung.
async function annualAvailable(who: Who) {
  const [rows, annual] = await Promise.all([
    visibleBalances([who.id]),
    prisma.leavePolicy.findMany({ where: { isActive: true, category: "TAHUNAN" }, orderBy: { sortOrder: "asc" } }),
  ]);
  const ids = new Set(annual.filter((p) => hasBalance(p)).map((p) => p.id));
  const row = rows.find((b) => ids.has(b.policyId));
  return row && !row.problem ? Math.max(0, row.balance - row.pending) : null;
}

// Pengajuan Absen: Lupa Absen, atau Tidak Masuk (potong Cuti Tahunan dengan sisa saldo / Izin Tanpa Hak Cuti).
async function absenceMenu(chatId: string, who: Who) {
  const sisa = await annualAvailable(who);
  await tgSend(chatId, "🕘 <b>Pengajuan Absen</b>", { buttons: [
    [{ text: "Lupa Absen (jam masuk / pulang)", data: "m|fix" }],
    [{ text: `Tidak Masuk · Potong Cuti${sisa !== null ? ` (sisa ${fmtDays(sisa)} hari)` : ""}`, data: "ab|T" }],
    [{ text: "Tidak Masuk · Izin Tanpa Hak Cuti", data: "ab|U" }],
    cancelRow,
  ] });
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
  if (!todayRow || (!todayRow.checkOut && !["CUTI", "DINAS", "IZIN", "SAKIT"].includes(todayRow.status))) dates.unshift(ymd(today));
  const list = [...new Set(dates)].filter((d) => !covered.has(d)).slice(0, 8);
  if (!list.length) { await tgSend(chatId, "✅ Tidak ada absen yang belum lengkap dalam 31 hari terakhir."); return; }
  await tgSend(chatId, "🕘 <b>Lupa Absen</b>\nPilih tanggal yang absennya belum lengkap:", { buttons: [...dayButtons(list, (d) => `fd|${d}`, ymd(today)), cancelRow] });
}

async function otDates(chatId: string) {
  const t = wibToday().getTime();
  const d = (n: number) => ymd(new Date(t + n * DAY));
  await tgSend(chatId, "⏱️ <b>Lembur</b>\nPilih tanggal lembur:", { buttons: [
    [{ text: `Kemarin ${label(d(-1))}`, data: `od|${d(-1)}` }, { text: `Hari ini ${label(d(0))}`, data: `od|${d(0)}` }],
    [{ text: `Besok ${label(d(1))}`, data: `od|${d(1)}` }, { text: `Lusa ${label(d(2))}`, data: `od|${d(2)}` }],
    cancelRow,
  ] });
}

// Jenis cuti yang boleh dipilih karyawan ini (sama dengan halaman Cuti di portal).
async function leaveTypes(chatId: string, who: Who) {
  const [me, policies, balances] = await Promise.all([
    prisma.user.findUnique({ where: { id: who.id }, select: { employmentStatus: true, gender: true, joinDate: true } }),
    prisma.leavePolicy.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    visibleBalances([who.id]),
  ]);
  if (!me) return;
  const today = todayDate();
  const list = policies.filter((p) => eligible(p, me, today, hasBalance(p) ? balances.find((b) => b.policyId === p.id)?.balance ?? 0 : 0) && p.category !== "DINAS" && !(p.category === "TAHUNAN" && !hasBalance(p)));
  if (!list.length) { await tgSend(chatId, "Belum ada jenis cuti yang bisa Anda ajukan. Hubungi HRD."); return; }
  const btn = (p: (typeof list)[number]): TgButton => {
    const b = hasBalance(p) ? balances.find((x) => x.policyId === p.id) : null;
    const sisa = b && !b.problem ? ` (sisa ${fmtDays(Math.max(0, b.balance - b.pending))})` : "";
    return { text: `${p.name}${sisa}`.slice(0, 60), data: `lp|${p.id}` };
  };
  await tgSend(chatId, "🗓️ <b>Cuti</b>\nPilih jenis cuti:", { buttons: [...list.map((p) => [btn(p)]), cancelRow] });
}

// ── Balasan teks / foto ───────────────────────────────────────────────────────────────────────────────────
export async function onFormReply(chatId: string, tag: string, text: string, media?: TgMedia) {
  const m = tag.match(/#(fx|fr|os|oe|or|ar|tt|tp|ls|le|lr|lf|sd|sn|sr)\|(.*)$/);
  if (!m) return false;
  const k = m[1], p = m[2].split("|");
  const again = (msg: string, ph: string) => ask(chatId, `⚠️ ${msg}`, m[0], ph);
  const time = () => parseTime(text);

  if (k === "fx") {
    const t = time(); if (!t) { await again("Format jam belum benar. Ketik lagi.", "Contoh 17:30"); return true; }
    await ask(chatId, `🕘 Lupa Absen <b>${label(p[0])}</b> · jam ${p[1] === "i" ? "masuk" : "pulang"} <b>${t}</b>\nAlasan lupa absen?`, `#fr|${p[0]}|${p[1]}|${t.replace(":", "")}`, "Alasan");
    return true;
  }
  if (k === "os") {
    const t = time(); if (!t) { await again("Format jam belum benar. Ketik lagi.", "Contoh 17:00"); return true; }
    await ask(chatId, `⏱️ Lembur <b>${label(p[0])}</b> · mulai <b>${t}</b>\nJam <b>selesai</b> lembur?`, `#oe|${p[0]}|${t.replace(":", "")}`, "Contoh 20:00");
    return true;
  }
  if (k === "oe") {
    const t = time(); if (!t) { await again("Format jam belum benar. Ketik lagi.", "Contoh 20:00"); return true; }
    await ask(chatId, `⏱️ Lembur <b>${label(p[0])}</b> · ${hhmm(p[1])}–${t}\nKeperluan lembur?`, `#or|${p[0]}|${p[1]}|${t.replace(":", "")}`, "Keperluan");
    return true;
  }
  if (k === "tt") {
    const dest = clean(text, 120); if (!dest) return true;
    await ask(chatId, `🚗 Dinas ${label(dash(p[0]))}${p[0] === p[1] ? "" : ` – ${label(dash(p[1]))}`} · <b>${esc(dest)}</b>\nKeperluan dinas?`, `#tp|${p[0]}|${p[1]}|${dest}`, "Keperluan");
    return true;
  }
  if (k === "ls") {
    const d = parseDate(text); if (!d) { await again("Format tanggal belum benar. Ketik lagi.", "Contoh 03-12-2026"); return true; }
    await ask(chatId, `🗓️ Cuti mulai <b>${label(d)}</b>\nSampai tanggal?`, `#le|${p[0]}|${d8(d)}`, `Contoh ${d.slice(8, 10)}-${d.slice(5, 7)}-${d.slice(0, 4)}`);
    return true;
  }
  if (k === "le") {
    const d = parseDate(text); if (!d) { await again("Format tanggal belum benar. Ketik lagi.", "Contoh 05-12-2026"); return true; }
    if (d8(d) < p[1]) { await again("Tanggal selesai tidak boleh sebelum tanggal mulai. Ketik lagi.", "Tanggal selesai"); return true; }
    await ask(chatId, `🗓️ Cuti <b>${label(dash(p[1]))}${d8(d) === p[1] ? "" : ` – ${label(d)}`}</b>\nAlasan cuti?`, `#lr|${p[0]}|${p[1]}|${d8(d)}`, "Alasan");
    return true;
  }
  if (k === "lf") {
    // Lampiran wajib: foto (JPG/PNG) atau PDF, dibalas ke pertanyaan bot.
    if (!media) { await again("Kirim foto atau PDF lampirannya.", "Lampiran"); return true; }
    if (!["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(media.mime)) { await again("Lampiran harus foto (JPG/PNG) atau PDF.", "Lampiran"); return true; }
    if (media.size > 900_000) { await again("Ukuran lampiran terlalu besar (maks ±900 KB). Kirim sebagai foto biasa (bukan file), atau PDF yang lebih kecil.", "Lampiran"); return true; }
    await leaveSummary(chatId, p[0], p[1], p[2], p.slice(3).join(" "), media);
    return true;
  }

  if (k === "sd") {
    const d = parseDate(text); if (!d) { await again("Format tanggal belum benar. Ketik lagi.", "Contoh 03-12-2026"); return true; }
    const who = await prisma.user.findFirst({ where: { telegramChatId: chatId, isActive: true }, select: { id: true, name: true } });
    if (who) await askPartner(chatId, who, d8(d));
    return true;
  }
  if (k === "sn") {
    const q = clean(text, 60);
    if (q.length < 2) { await again("Ketik minimal 2 huruf nama, atau NIK rekan.", "Nama / NIK rekan"); return true; }
    const me = await prisma.user.findFirst({ where: { telegramChatId: chatId, isActive: true }, select: { id: true } });
    if (!me) return true;
    const found = await prisma.user.findMany({
      where: { isActive: true, role: { not: "SUPER_ADMIN" }, id: { not: me.id }, OR: [{ name: { contains: q, mode: "insensitive" } }, { employeeId: { equals: q, mode: "insensitive" } }] },
      orderBy: { name: "asc" }, take: 9, select: { id: true, name: true, department: { select: { name: true } } },
    });
    if (!found.length) { await again(`Rekan "${esc(q)}" tidak ditemukan. Ketik lagi.`, "Nama / NIK rekan"); return true; }
    const more = found.length > 8 ? "\n<i>Terlalu banyak yang cocok; bila rekan tidak ada di daftar, ketik nama lebih lengkap.</i>" : "";
    await tgSend(chatId, `🔄 Pilih rekan:${more}`, { buttons: [
      ...found.slice(0, 8).map((u) => [{ text: `${u.name}${u.department ? ` · ${u.department.name}` : ""}`.slice(0, 60), data: `sp|${p[0]}|${u.id}` }]),
      [{ text: "🔎 Cari lagi", data: `sd|${p[0]}` }], cancelRow,
    ] });
    return true;
  }

  const reason = clean(text);
  if (!reason) return true;
  if (k === "sr") {
    const partner = await prisma.user.findUnique({ where: { id: p[1] }, select: { name: true } });
    await tgSend(chatId, `🔄 <b>Tukar Shift</b>\nTanggal: ${label(dash(p[0]))}\nRekan: ${esc(partner?.name)}\nAlasan: ${esc(reason)}`,
      { buttons: [[{ text: "✅ Kirim", data: `k|sw|${p[0]}|${p[1]}` }, ...cancelRow]] });
    return true;
  }
  if (k === "fr") {
    await tgSend(chatId, `🕘 <b>Lupa Absen</b>\nTanggal: ${label(p[0])}\nJam ${p[1] === "i" ? "masuk" : "pulang"}: ${hhmm(p[2])}\nAlasan: ${esc(reason)}`,
      { buttons: [[{ text: "✅ Kirim", data: `k|fx|${p[0]}|${p[1]}|${p[2]}` }, ...cancelRow]] });
    return true;
  }
  if (k === "or") {
    await tgSend(chatId, `⏱️ <b>Lembur</b>\nTanggal: ${label(p[0])}\nJam: ${hhmm(p[1])}–${hhmm(p[2])}\nAlasan: ${esc(reason)}`,
      { buttons: [[{ text: "✅ Kirim", data: `k|ot|${p[0]}|${p[1]}|${p[2]}` }, ...cancelRow]] });
    return true;
  }
  if (k === "ar") {
    const range = `${label(dash(p[1]))}${p[1] === p[2] ? "" : ` – ${label(dash(p[2]))}`}`;
    await tgSend(chatId, `🕘 <b>Tidak Masuk · ${p[0] === "T" ? "Potong Cuti Tahunan" : "Izin Tanpa Hak Cuti"}</b>\nTanggal: ${range}\nAlasan: ${esc(reason)}`,
      { buttons: [[{ text: "✅ Kirim", data: `k|ab|${p[0]}|${p[1]}|${p[2]}` }, ...cancelRow]] });
    return true;
  }
  if (k === "tp") {
    const range = `${label(dash(p[0]))}${p[0] === p[1] ? "" : ` – ${label(dash(p[1]))}`}`;
    await tgSend(chatId, `🚗 <b>Dinas Luar</b>\nTanggal: ${range}\nTujuan: ${esc(p.slice(2).join(" "))}\nKeperluan: ${esc(reason)}`,
      { buttons: [[{ text: "✅ Kirim", data: `k|tr|${p[0]}|${p[1]}` }, ...cancelRow]] });
    return true;
  }
  if (k === "lr") {
    const policy = await prisma.leavePolicy.findUnique({ where: { id: p[0] }, select: { needsAttachment: true, attachmentNote: true } });
    if (policy?.needsAttachment) {
      await ask(chatId, `📎 Kirim foto / PDF <b>${esc(policy.attachmentNote?.trim() || "dokumen pendukung")}</b>.`, `#lf|${p[0]}|${p[1]}|${p[2]}|${reason}`, "Lampiran");
      return true;
    }
    await leaveSummary(chatId, p[0], p[1], p[2], reason);
    return true;
  }
  return false;
}

async function leaveSummary(chatId: string, policyId: string, start: string, end: string, reason: string, media?: TgMedia) {
  const policy = await prisma.leavePolicy.findUnique({ where: { id: policyId }, select: { name: true } });
  const range = `${label(dash(start))}${start === end ? "" : ` – ${label(dash(end))}`}`;
  const attach = media ? `\nLampiran: ${esc(media.name)}${hidden(`#lx|${media.fileId}|${media.mime}|${clean(media.name, 60)}`)}` : "";
  await tgSend(chatId, `🗓️ <b>${esc(policy?.name ?? "Cuti")}</b>\nTanggal: ${range}\nAlasan: ${esc(reason)}${attach}`,
    { buttons: [[{ text: "✅ Kirim", data: `k|lv|${policyId}|${start}|${end}` }, ...cancelRow]] });
}
