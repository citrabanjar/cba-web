// Modul Lembur.
// - Fitur SPL (Surat Perintah Lembur) dinyalakan Super Admin di Pengaturan → Fitur.
//   SPL aktif: Admin membuat SPL (tanggal, jam lembur, jam istirahat, banyak karyawan); karyawan menjawab
//   Bersedia / Tidak bersedia. SPL tidak aktif: karyawan mengajukan lembur sendiri, diputus atasan / Workflow.
// - Jam yang dibayar = bagian rentang lembur yang benar-benar dijalani (sampai jam check-out), dikurangi
//   istirahat, dibulatkan ke bawah per 1 jam penuh (kurang dari 1 jam tidak dibayar).
// - Check-out melewati jam akhir SPL (≥ 1 jam) → revisi jam lembur ke Admin (Task Admin). Selama revisi belum
//   diputus, lembur dibayar sampai jam akhir SPL dan gaji periode itu belum bisa difinalkan.
import { prisma } from "@/lib/prisma";
import { getShiftCalendar } from "@/lib/schedule";

export const SPL_SETTING_KEY = "overtime-spl";
const DAY = 86_400_000;
const keyOf = (d: Date) => d.toISOString().slice(0, 10);

export async function splEnabled() {
  const row = await prisma.appSetting.findUnique({ where: { key: SPL_SETTING_KEY } });
  return (row?.value as { enabled?: boolean } | null)?.enabled === true;
}

import { OT_APPROVED } from "@/lib/overtime-status";
export { OT_APPROVED, OT_STATUS } from "@/lib/overtime-status";

export const isTime = (v: unknown): v is string => typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const toMin = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };

// Waktu "HH:MM" WIB pada tanggal (UTC tengah malam) → Date.
export const atWib = (date: Date, hhmm: string, nextDay = false) =>
  new Date(Date.parse(`${keyOf(date)}T${hhmm}:00+07:00`) + (nextDay ? DAY : 0));

// Rentang lembur (dan istirahat) sebagai waktu nyata. Jam akhir ≤ jam mulai = lewat tengah malam.
export function otWindow(o: { date: Date; startTime: string; endTime: string; breakStart?: string | null; breakEnd?: string | null }, endOverride?: string | null) {
  const endT = endOverride ?? o.endTime;
  const start = atWib(o.date, o.startTime);
  const end = atWib(o.date, endT, toMin(endT) <= toMin(o.startTime));
  let brk: [Date, Date] | null = null;
  if (o.breakStart && o.breakEnd) {
    const bs = atWib(o.date, o.breakStart, toMin(o.breakStart) < toMin(o.startTime));
    const be = atWib(o.date, o.breakEnd, toMin(o.breakEnd) <= toMin(o.breakStart) || toMin(o.breakEnd) < toMin(o.startTime));
    brk = [bs, be];
  }
  return { start, end, brk };
}

// Menit lembur bersih (tanpa istirahat) di rentang [from, to].
function netMinutes(from: Date, to: Date, brk: [Date, Date] | null) {
  if (to <= from) return 0;
  let m = (to.getTime() - from.getTime()) / 60_000;
  if (brk) m -= Math.max(0, (Math.min(to.getTime(), brk[1].getTime()) - Math.max(from.getTime(), brk[0].getTime())) / 60_000);
  return Math.max(0, m);
}

// Lama lembur terjadwal (jam, tanpa istirahat) untuk ditampilkan.
export function plannedHours(o: { date: Date; startTime: string; endTime: string; breakStart?: string | null; breakEnd?: string | null }) {
  const w = otWindow(o);
  return Math.round((netMinutes(w.start, w.end, w.brk) / 60) * 100) / 100;
}

type Att = { checkIn: Date | null; checkOut: Date | null } | null | undefined;
type OtRow = { date: Date; startTime: string; endTime: string; breakStart: string | null; breakEnd: string | null; orderId: string | null; revisionStatus: string | null; revisionEnd: string | null };

// Jam lembur yang dibayar: rentang lembur ∩ jam absen (masuk s/d check-out), tanpa istirahat, per 1 jam penuh.
export function paidHours(o: OtRow, att: Att) {
  if (!att?.checkOut) return 0; // tanpa absen pulang tidak ada bukti lembur
  const w = otWindow(o, o.revisionStatus === "DISETUJUI" ? o.revisionEnd : null);
  const from = att.checkIn && att.checkIn > w.start ? att.checkIn : w.start;
  const to = att.checkOut < w.end ? att.checkOut : w.end;
  return Math.floor(netMinutes(from, to, w.brk) / 60);
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
    const h = paidHours(r, att.get(keyOf(r.date)));
    if (h <= 0) continue;
    const s = cal[keyOf(r.date)];
    (s && (s.isOff || s.holiday) ? rest : work).push(h);
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
