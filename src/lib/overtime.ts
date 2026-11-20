// Modul Lembur.
// - Fitur SPL (Surat Perintah Lembur) dinyalakan Super Admin di Pengaturan → Fitur.
//   SPL aktif: Admin membuat SPL (tanggal, jam lembur, jam istirahat, banyak karyawan); karyawan menjawab
//   Bersedia / Tidak bersedia. SPL tidak aktif: karyawan mengajukan lembur sendiri, diputus atasan / Workflow.
// - Jam yang dibayar = bagian rentang lembur yang benar-benar dijalani (sampai jam check-out), dikurangi
//   istirahat lembur, dibulatkan ke bawah per 1 jam penuh (kurang dari 1 jam tidak dibayar).
// - Istirahat lembur (SOP form SPL lama, lib/overtime-calc.ts): hari kerja 18:00-19:00; hari libur 12:00-13:00 dan
//   18:00-19:00; dipotong hanya bila tercakup penuh oleh jam lembur.
// - Di hari kerja, lembur dibatasi shift: sebelum masuk paling lambat sampai jam masuk, sesudah pulang paling
//   cepat mulai jam pulang; jam kerja shift tidak dihitung lembur. Hari OFF / libur tidak dibatasi.
// - Check-out melewati jam akhir SPL (≥ 1 jam) → revisi jam lembur ke Admin (Task Admin). Selama revisi belum
//   diputus, lembur dibayar sampai jam akhir SPL dan gaji periode itu belum bisa difinalkan.
import { prisma } from "@/lib/prisma";
import { getShiftCalendar, getShiftCalendars, type DayShift } from "@/lib/schedule";

export const SPL_SETTING_KEY = "overtime-spl";
const DAY = 86_400_000;
const keyOf = (d: Date) => d.toISOString().slice(0, 10);

export async function splEnabled() {
  const row = await prisma.appSetting.findUnique({ where: { key: SPL_SETTING_KEY } });
  return (row?.value as { enabled?: boolean } | null)?.enabled === true;
}

// Lembur tidak boleh di tanggal dinas luar (sedang diajukan / disetujui) atau yang sudah tercatat Dinas di kehadiran.
// Hasil: userId → keterangan dinasnya.
export async function dinasOn(userIds: string[], date: Date) {
  const out = new Map<string, string>();
  if (!userIds.length) return out;
  const [trips, atts] = await Promise.all([
    prisma.businessTrip.findMany({
      where: { userId: { in: userIds }, status: { in: ["PENDING", "APPROVED"] }, startDate: { lte: date }, endDate: { gte: date } },
      select: { userId: true, destination: true, status: true },
    }),
    prisma.attendance.findMany({ where: { userId: { in: userIds }, date, status: "DINAS" }, select: { userId: true } }),
  ]);
  for (const a of atts) out.set(a.userId, "tercatat Dinas di kehadiran");
  for (const t of trips) out.set(t.userId, `dinas luar ${t.destination} ${t.status === "PENDING" ? "sedang diajukan" : "sudah disetujui"}`);
  return out;
}

// Lembur aktif (belum ditolak/dibatalkan) yang jatuh di rentang tanggal, untuk mencegah dinas yang beririsan.
export const OT_ACTIVE = ["PENDING", "APPROVED", "MENUNGGU_KARYAWAN", "DISETUJUI"];

import { OT_APPROVED } from "@/lib/overtime-status";
export { OT_APPROVED, OT_STATUS } from "@/lib/overtime-status";

export const isTime = (v: unknown): v is string => typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
import { otBreaks, otBreakText, otPlan, toMin } from "@/lib/overtime-calc";
export { otBreakText, otPlan, OT_BREAK_RULE } from "@/lib/overtime-calc";
// Dua rentang lembur di tanggal yang sama bertabrakan? (lewat tengah malam: jam selesai <= jam mulai → +24 jam).
// Lembur sebelum shift dan sesudah shift di hari yang sama boleh (keputusan pemilik 2026-11-20).
export function otOverlap(a: { startTime: string; endTime: string }, b: { startTime: string; endTime: string }) {
  const m = (t: string) => { const [h, mm] = t.split(":").map(Number); return h * 60 + mm; };
  const span = (x: { startTime: string; endTime: string }) => { const s = m(x.startTime), e = m(x.endTime); return [s, e <= s ? e + 1440 : e] as const; };
  const [as, ae] = span(a), [bs, be] = span(b);
  return as < be && bs < ae;
}

// Waktu "HH:MM" WIB pada tanggal (UTC tengah malam) → Date.
export const atWib = (date: Date, hhmm: string, nextDay = false) =>
  new Date(Date.parse(`${keyOf(date)}T${hhmm}:00+07:00`) + (nextDay ? DAY : 0));

// Hari libur untuk lembur: shift OFF / hari libur; tanpa jadwal: hari Minggu.
export const OT_BREAK_TEXT = `${otBreakText(false)} (hari kerja) / ${otBreakText(true)} (hari libur)`;
export const isRestDay = (s: DayShift | null | undefined, date: Date) => (s ? s.isOff || !!s.holiday : date.getUTCDay() === 0);
export const restKey = (userId: string, date: Date) => `${userId}|${keyOf(date)}`;
// Tanggal lembur yang jatuh di hari libur, untuk banyak baris sekaligus (kunci restKey).
export async function restDaysOf(rows: { userId: string; date: Date }[]) {
  const set = new Set<string>();
  if (!rows.length) return set;
  const ids = [...new Set(rows.map((r) => r.userId))];
  const ts = rows.map((r) => r.date.getTime());
  const cal = await getShiftCalendars(ids, new Date(Math.min(...ts)), new Date(Math.max(...ts)));
  for (const r of rows) if (isRestDay(cal[r.userId]?.[keyOf(r.date)], r.date)) set.add(restKey(r.userId, r.date));
  return set;
}

// Rentang lembur sebagai waktu nyata, beserta istirahat lembur hari itu (dan esoknya bila lewat tengah malam).
// Jam akhir ≤ jam mulai = lewat tengah malam.
export function otWindow(o: { date: Date; startTime: string; endTime: string }, endOverride?: string | null, rest = false) {
  const endT = endOverride ?? o.endTime;
  const start = atWib(o.date, o.startTime);
  const end = atWib(o.date, endT, toMin(endT) <= toMin(o.startTime));
  const brks: [Date, Date][] = [];
  for (const next of [false, true]) for (const [a, b] of otBreaks(rest)) brks.push([atWib(o.date, a, next), atWib(o.date, b, next)]);
  return { start, end, brks };
}

const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

// Menit lembur bersih di rentang [from, to]: dikurangi istirahat yang tercakup penuh dan jam kerja shift (bila ada).
function netMinutes(from: Date, to: Date, allBrks: [Date, Date][], work?: [Date, Date] | null) {
  if (to <= from) return 0;
  const f = from.getTime(), t = to.getTime();
  const brks = allBrks.filter(([b0, b1]) => b0.getTime() >= f && b1.getTime() <= t);
  let m = (t - f) / 60_000;
  for (const [b0, b1] of brks) m -= (b1.getTime() - b0.getTime()) / 60_000;
  if (work) {
    // jam kerja shift dikurangi, tanpa memotong dua kali bagian yang juga istirahat
    const w0 = work[0].getTime(), w1 = work[1].getTime();
    let w = overlap(f, t, w0, w1);
    for (const [b0, b1] of brks) {
      const s = Math.max(f, w0, b0.getTime()), e = Math.min(t, w1, b1.getTime());
      if (e > s) w -= e - s;
    }
    m -= w / 60_000;
  }
  return Math.max(0, m);
}

// Jam kerja shift sebagai waktu nyata (null untuk OFF / libur / tanpa jam).
export function shiftWindow(date: Date, s: DayShift | null | undefined): [Date, Date] | null {
  if (!s || s.isOff || s.holiday || !s.startTime || !s.endTime) return null;
  return [atWib(date, s.startTime), atWib(date, s.endTime, toMin(s.endTime) <= toMin(s.startTime))];
}

// Lama lembur terjadwal (jam, tanpa istirahat) untuk ditampilkan. rest = hari libur (lihat restDaysOf).
export function plannedHours(o: { date: Date; startTime: string; endTime: string }, rest = false) {
  return otPlan(o.startTime, o.endTime, rest).hours;
}

// Rentang lembur yang bentrok dengan jam kerja shift. Hasil: userId -> pesan (karyawan yang shiftnya OFF / libur bebas).
export async function shiftConflicts(userIds: string[], date: Date, startTime: string, endTime: string) {
  const out = new Map<string, string>();
  if (!userIds.length) return out;
  const cal = await getShiftCalendars(userIds, date, date);
  const k = keyOf(date);
  const w = otWindow({ date, startTime, endTime });
  for (const id of userIds) {
    const s = cal[id]?.[k];
    const sw = shiftWindow(date, s);
    if (!sw || !s) continue;
    if (overlap(w.start.getTime(), w.end.getTime(), sw[0].getTime(), sw[1].getTime()) > 0)
      out.set(id, `jam kerja ${s.startTime}–${s.endTime}: lembur sebelum masuk paling lambat sampai ${s.startTime}, sesudah pulang mulai ${s.endTime}`);
  }
  return out;
}

type Att = { checkIn: Date | null; checkOut: Date | null } | null | undefined;
type OtRow = { date: Date; startTime: string; endTime: string; breakStart: string | null; breakEnd: string | null; orderId: string | null; revisionStatus: string | null; revisionEnd: string | null };

// Jam lembur yang dibayar: rentang lembur ∩ jam absen (masuk s/d check-out), tanpa istirahat tetap dan tanpa
// jam kerja shift (bila diberikan), per 1 jam penuh.
export function paidHours(o: OtRow, att: Att, work?: [Date, Date] | null, rest = false) {
  if (!att?.checkOut) return 0; // tanpa absen pulang tidak ada bukti lembur
  const w = otWindow(o, o.revisionStatus === "DISETUJUI" ? o.revisionEnd : null, rest);
  const from = att.checkIn && att.checkIn > w.start ? att.checkIn : w.start;
  const to = att.checkOut < w.end ? att.checkOut : w.end;
  return Math.floor(netMinutes(from, to, w.brks, work) / 60);
}

// Check-out melewati jam akhir SPL sedikitnya 1 jam → perlu revisi jam lembur ke Admin.
export function overrunEnd(o: OtRow, att: Att): string | null {
  if (!o.orderId || !att?.checkOut) return null;
  const w = otWindow(o);
  if (att.checkOut.getTime() - w.end.getTime() < 60 * 60_000) return null;
  return new Date(att.checkOut.getTime() + 7 * 3600_000).toISOString().slice(11, 16);
}

// Tandai lembur SPL yang check-out-nya melewati jam akhir SPL sebagai "revisi menunggu" (sekali saja).
export async function syncRevisions(sinceDays = 45) {
  const since = new Date(Date.now() - sinceDays * DAY);
  const rows = await prisma.overtime.findMany({
    where: { orderId: { not: null }, status: "DISETUJUI", revisionStatus: null, date: { gte: since } },
    select: { id: true, userId: true, date: true, startTime: true, endTime: true, breakStart: true, breakEnd: true, orderId: true, revisionStatus: true, revisionEnd: true },
  });
  if (!rows.length) return 0;
  const atts = await prisma.attendance.findMany({
    where: { OR: rows.map((r) => ({ userId: r.userId, date: r.date })) },
    select: { userId: true, date: true, checkIn: true, checkOut: true },
  });
  const byKey = new Map(atts.map((a) => [`${a.userId}|${keyOf(a.date)}`, a]));
  let n = 0;
  for (const r of rows) {
    const end = overrunEnd(r, byKey.get(`${r.userId}|${keyOf(r.date)}`));
    if (!end) continue;
    await prisma.overtime.update({ where: { id: r.id }, data: { revisionStatus: "MENUNGGU", revisionEnd: end } });
    n++;
  }
  return n;
}

// Jam lembur dibayar per lembur dalam periode, dipisah hari kerja / hari libur (shift OFF atau hari libur).
export async function overtimeForPayroll(userId: string, start: Date, end: Date) {
  const rows = await prisma.overtime.findMany({
    where: { userId, status: { in: OT_APPROVED }, date: { gte: start, lte: end } },
    orderBy: { date: "asc" },
  });
  if (!rows.length) return { work: [] as number[], rest: [] as number[] };
  const [atts, cal] = await Promise.all([
    prisma.attendance.findMany({ where: { userId, date: { gte: start, lte: end } }, select: { date: true, checkIn: true, checkOut: true } }),
    getShiftCalendar(userId, start, end),
  ]);
  const att = new Map(atts.map((a) => [keyOf(a.date), a]));
  const work: number[] = [], rest: number[] = [];
  for (const r of rows) {
    const s = cal[keyOf(r.date)];
    const isRest = isRestDay(s, r.date);
    const h = paidHours(r, att.get(keyOf(r.date)), shiftWindow(r.date, s), isRest);
    if (h <= 0) continue;
    (isRest ? rest : work).push(h);
  }
  return { work, rest };
}

// Revisi jam lembur yang belum diputus dalam rentang tanggal (penghalang finalisasi gaji).
export async function pendingRevisions(start?: Date, end?: Date) {
  return prisma.overtime.count({ where: { revisionStatus: "MENUNGGU", ...(start && end ? { date: { gte: start, lte: end } } : {}) } });
}

// Nomor SPL berikutnya: SPL/2026/11/001.
export async function nextSplNumber(date: Date) {
  const prefix = `SPL/${date.getUTCFullYear()}/${String(date.getUTCMonth() + 1).padStart(2, "0")}/`;
  const last = await prisma.overtimeOrder.findFirst({ where: { number: { startsWith: prefix } }, orderBy: { number: "desc" }, select: { number: true } });
  const n = last ? Number(last.number.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(n).padStart(3, "0")}`;
}
