import { prisma } from "@/lib/prisma";
import { getShiftCalendar, getShiftCalendars, type DayShift } from "@/lib/schedule";

// Penilaian kehadiran otomatis (aturan CBA, keputusan pemilik 2026-11-10):
// - Tanggal kerja mengikuti WIB. Shift lewat tengah malam (mis. Security Malam 23–07) dicatat
//   pada tanggal shift DIMULAI, termasuk absen pulangnya di pagi hari berikutnya.
// - Hari kerja terjadwal yang sudah lewat tanpa absen, tanpa cuti/izin/sakit dan dinas yang
//   disetujui = ALPHA otomatis (catatan AUTO_ALPHA). Penilaian diulang saat dipanggil lagi, jadi
//   cuti/dinas yang diinput belakangan otomatis menghapus Alpha-nya; tanggal di periode gaji yang
//   sudah FINAL tidak diubah lagi (terkunci).
// - Jadwal manual yang belum diisi ("Belum dijadwalkan") dan hari OFF/libur tidak pernah Alpha.
// - Terlambat / pulang cepat dihitung langsung dari jam absen vs shift (lib attendance-penalty).

export const AUTO_ALPHA = "Otomatis: tidak ada absen pada hari kerja terjadwal";
const DAY = 86_400_000;
const key = (d: Date) => d.toISOString().slice(0, 10);
const toMin = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return (h || 0) * 60 + (m || 0); };

// Tanggal hari ini menurut WIB, sebagai tengah malam UTC (format kolom @db.Date).
export function wibToday(now = Date.now()) {
  const d = new Date(now + 7 * 3600_000);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
// Menit sejak 00:00 WIB hari ini.
const wibMinutes = (now = Date.now()) => { const d = new Date(now + 7 * 3600_000); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
const crossesMidnight = (s?: DayShift) => !!(s && !s.isOff && s.startTime && s.endTime && toMin(s.endTime) <= toMin(s.startTime));

// Tanggal kerja untuk absen masuk sekarang: biasanya hari ini (WIB); kalau shift kemarin lewat tengah
// malam, belum check-in, dan sekarang masih sebelum jam pulangnya, absen ini milik shift kemarin.
export async function checkInWorkDate(userId: string, now = Date.now()) {
  const today = wibToday(now);
  const yesterday = new Date(today.getTime() - DAY);
  const cal = await getShiftCalendar(userId, yesterday, yesterday);
  const y = cal[key(yesterday)];
  if (crossesMidnight(y) && wibMinutes(now) < toMin(y!.endTime!)) {
    const att = await prisma.attendance.findUnique({ where: { userId_date: { userId, date: yesterday } }, select: { checkIn: true } });
    if (!att?.checkIn) return yesterday;
  }
  return today;
}

// ─── Batas jam absen per shift (Jadwal → Shift) ─────────────────────────────
// N = "absen masuk dibuka sebelum jam masuk": check-in sebelum jam masuk − N ditolak; check-in lewat jam masuk + N
// boleh tetapi diberi peringatan dulu. M = "absen pulang ditutup setelah jam pulang": check-out lewat jam pulang + M
// ditolak; check-out sebelum jam pulang − M diberi peringatan. Hari tanpa jam shift (libur, jadwal manual) tidak dibatasi.
// Waktu absolut jam "HH:MM" WIB pada tanggal kerja `date` (+1 hari bila nextDay).
const atWib = (date: Date, hhmm: string, nextDay = false) => date.getTime() + toMin(hhmm) * 60_000 - 7 * 3600_000 + (nextDay ? DAY : 0);
export const clockWib = (t: number) => { const d = new Date(t + 7 * 3600_000); return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`; };
const dayLabel = (t: number, ref: Date) => (wibToday(t).getTime() === ref.getTime() ? "" : " besok");
// Karyawan Bebas Absen: absen bersifat opsional, tanpa batas jam dan tanpa peringatan potongan.
const shiftOn = async (userId: string, date: Date) => {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { attendanceExempt: true } });
  return u?.attendanceExempt ? undefined : (await getShiftCalendar(userId, date, date))[key(date)];
};
const HALF_DAY_HINT = "Potongan gaji Anda akan besar. Gunakan cuti setengah hari sebagai alternatif.";

// Absen masuk pada tanggal kerja `date`: error bila belum dibuka.
export async function checkInBlocked(userId: string, date: Date, now = Date.now()) {
  const s = await shiftOn(userId, date);
  if (!s || s.isOff || !s.startTime || s.checkInOpen == null) return null;
  const open = atWib(date, s.startTime) - s.checkInOpen * 60_000;
  if (now < open) return `Absen masuk baru dibuka pukul ${clockWib(open)}${dayLabel(open, wibToday(now))} (shift ${s.startTime}).`;
  return null;
}
// Peringatan sebelum check-in yang sangat terlambat (lewat jam masuk + N menit).
export async function checkInWarning(userId: string, date: Date, now = Date.now()) {
  const s = await shiftOn(userId, date);
  if (!s || s.isOff || !s.startTime || s.checkInOpen == null) return null;
  const start = atWib(date, s.startTime);
  if (now <= start + s.checkInOpen * 60_000) return null;
  return `Anda check-in pukul ${clockWib(now)}, lewat lebih dari ${s.checkInOpen} menit dari jam masuk (${s.startTime}). ${HALF_DAY_HINT} Tetap lanjut check-in?`;
}

// Absen pulang untuk absen tanggal `date`: error bila lewat batas.
export async function checkOutBlocked(userId: string, date: Date, now = Date.now()) {
  const s = await shiftOn(userId, date);
  if (!s || s.isOff || !s.endTime || s.checkOutClose == null) return null;
  const close = atWib(date, s.endTime, crossesMidnight(s)) + s.checkOutClose * 60_000;
  if (now > close) return `Batas absen pulang sudah lewat (pukul ${clockWib(close)}). Hubungi Admin untuk lupa absen pulang.`;
  return null;
}
// Peringatan sebelum check-out yang jauh lebih awal (sebelum jam pulang − M menit).
export async function checkOutWarning(userId: string, date: Date, now = Date.now()) {
  const s = await shiftOn(userId, date);
  if (!s || s.isOff || !s.endTime || s.checkOutClose == null) return null;
  const end = atWib(date, s.endTime, crossesMidnight(s));
  if (now >= end - s.checkOutClose * 60_000) return null;
  return `Anda check-out pukul ${clockWib(now)}, lebih dari ${s.checkOutClose} menit sebelum jam pulang (${s.endTime}). ${HALF_DAY_HINT} Tetap lanjut check-out?`;
}

// Absen yang sedang berjalan untuk absen pulang: hari ini, atau shift malam kemarin yang belum check-out,
// atau shift kemarin yang lembur lewat tengah malam selama masih dalam batas absen pulang.
export async function openAttendance(userId: string, now = Date.now()) {
  const today = wibToday(now);
  const yesterday = new Date(today.getTime() - DAY);
  const [todayAtt, yAtt] = await Promise.all([
    prisma.attendance.findUnique({ where: { userId_date: { userId, date: today } } }),
    prisma.attendance.findUnique({ where: { userId_date: { userId, date: yesterday } } }),
  ]);
  if (todayAtt?.checkIn && !todayAtt.checkOut) return todayAtt;
  if (yAtt?.checkIn && !yAtt.checkOut && now - yAtt.checkIn.getTime() < 20 * 3_600_000) {
    const cal = await getShiftCalendar(userId, yesterday, yesterday);
    const ys = cal[key(yesterday)];
    if (crossesMidnight(ys)) return yAtt;
    // Lembur lewat tengah malam: masih boleh absen pulang untuk kemarin selama belum melewati batas absen pulang.
    if (!todayAtt?.checkIn && ys && !ys.isOff && ys.endTime && ys.checkOutClose != null && now <= atWib(yesterday, ys.endTime) + ys.checkOutClose * 60_000) return yAtt;
  }
  return todayAtt;
}

// Nilai ulang Alpha otomatis untuk rentang tanggal [from, to] (dipotong sampai kemarin WIB).
export async function assessAttendance(from: Date, to: Date, userIds?: string[]) {
  const yesterday = new Date(wibToday().getTime() - DAY);
  const end = to > yesterday ? yesterday : to;
  if (end < from) return { created: 0, removed: 0 };

  // Tanggal di periode gaji bulanan yang sudah final tidak diubah.
  const finals = await prisma.payrollRun.findMany({ where: { status: "FINAL", frequency: "BULANAN" }, select: { period: true } });
  const locked = new Set(finals.map((f) => f.period));

  const users = await prisma.user.findMany({
    where: { role: { not: "SUPER_ADMIN" }, ...(userIds ? { id: { in: userIds } } : { OR: [{ isActive: true }, { resignDate: { gte: from } }] }) },
    select: { id: true, joinDate: true, resignDate: true, isActive: true, attendanceExempt: true },
  });
  if (!users.length) return { created: 0, removed: 0 };
  const ids = users.map((u) => u.id);
  const [calendars, atts, leaves, trips] = await Promise.all([
    getShiftCalendars(ids, from, end),
    prisma.attendance.findMany({ where: { userId: { in: ids }, date: { gte: from, lte: end } }, select: { id: true, userId: true, date: true, checkIn: true, status: true, note: true } }),
    prisma.leaveRequest.findMany({ where: { userId: { in: ids }, status: "APPROVED", startDate: { lte: end }, endDate: { gte: from } }, select: { userId: true, startDate: true, endDate: true } }),
    prisma.businessTrip.findMany({ where: { userId: { in: ids }, status: "APPROVED", startDate: { lte: end }, endDate: { gte: from } }, select: { userId: true, startDate: true, endDate: true } }),
  ]);
  const attBy = new Map(atts.map((a) => [`${a.userId}|${key(a.date)}`, a]));
  const covered = (list: { userId: string; startDate: Date; endDate: Date }[], userId: string, t: number) =>
    list.some((r) => r.userId === userId && r.startDate.getTime() <= t && t <= r.endDate.getTime());

  const create: { userId: string; date: Date }[] = [];
  const remove: string[] = [];
  for (const u of users) {
    for (let t = from.getTime(); t <= end.getTime(); t += DAY) {
      const date = new Date(t);
      const k = key(date);
      if (locked.has(k.slice(0, 7))) continue;
      const att = attBy.get(`${u.id}|${k}`);
      const employed = (!u.joinDate || u.joinDate.getTime() <= t) && (!u.resignDate || u.resignDate.getTime() > t);
      const day = calendars[u.id]?.[k];
      const working = employed && !u.attendanceExempt && !!day && !day.isOff && !day.manual && !!day.startTime;
      const excused = covered(leaves, u.id, t) || covered(trips, u.id, t);
      const isAuto = att && att.status === "ALPHA" && att.note === AUTO_ALPHA && !att.checkIn;
      if (isAuto && (!working || excused)) remove.push(att.id);
      else if (!att && working && !excused) create.push({ userId: u.id, date });
    }
  }
  if (remove.length) await prisma.attendance.deleteMany({ where: { id: { in: remove } } });
  if (create.length) {
    await prisma.attendance.createMany({
      data: create.map((c) => ({ ...c, status: "ALPHA" as const, note: AUTO_ALPHA })),
      skipDuplicates: true,
    });
  }
  return { created: create.length, removed: remove.length };
}

// Penilaian rutin 7 hari terakhir. Dipanggil cron malam, dan dari Beranda admin paling sering sekali per jam
// (cadangan selama cron belum aktif).
const ASSESS_KEY = "attendance.assessedAt";
export async function assessRecent(force = false) {
  if (!force) {
    const row = await prisma.appSetting.findUnique({ where: { key: ASSESS_KEY } });
    const at = (row?.value as { at?: number } | null)?.at ?? 0;
    if (Date.now() - at < 3_600_000) return null;
  }
  await prisma.appSetting.upsert({
    where: { key: ASSESS_KEY }, update: { value: { at: Date.now() } }, create: { key: ASSESS_KEY, value: { at: Date.now() } },
  });
  const today = wibToday();
  return assessAttendance(new Date(today.getTime() - 7 * DAY), new Date(today.getTime() - DAY));
}
