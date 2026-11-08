import { prisma } from "@/lib/prisma";

export type DayShift = {
  code: string; name: string; color: string; isOff: boolean;
  startTime: string | null; endTime: string | null;
  holiday?: string; // nama hari libur kalau tanggal itu libur
  manual?: boolean; // karyawan jadwal manual (Security), shift belum diisi per tanggal
  override?: boolean; // diisi per tanggal di Jadwal Bulanan (jadwal manual atau tukar shift)
};

const DAY = 86_400_000;
const keyOf = (d: Date) => d.toISOString().slice(0, 10);
const utcDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

type ShiftLike = { code: string; name: string; color: string; isOff: boolean; startTime: string | null; endTime: string | null };
const toDay = (s: ShiftLike, extra: Partial<DayShift> = {}): DayShift => ({
  code: s.code, name: s.name, color: s.color, isOff: s.isOff, startTime: s.startTime, endTime: s.endTime, ...extra,
});

// Shift per tanggal untuk banyak karyawan dalam rentang [from, to] (tanggal UTC tengah malam).
// Urutan prioritas: (1) shift yang diisi per tanggal di Jadwal Bulanan; (2) hari libur
// perusahaan → OFF; (3) jadwal yang berlaku (pola kerja; jadwal manual tanpa isian → "?").
export async function getShiftCalendars(userIds: string[], from: Date, to: Date) {
  const [schedules, holidays, overrides] = await Promise.all([
    prisma.employeeSchedule.findMany({
      where: { userId: { in: userIds }, effectiveDate: { lte: to } },
      orderBy: { effectiveDate: "asc" },
      include: { pattern: { include: { days: { include: { shift: true } } } } },
    }),
    prisma.holiday.findMany({ where: { date: { gte: from, lte: to } } }),
    prisma.employeeShiftDay.findMany({
      where: { userId: { in: userIds }, date: { gte: from, lte: to } },
      include: { shift: true },
    }),
  ]);
  const holidayByDay = new Map(holidays.map((h) => [keyOf(h.date), h.name]));
  const overrideBy = new Map(overrides.map((o) => [`${o.userId}|${keyOf(o.date)}`, o]));
  const result: Record<string, Record<string, DayShift>> = {};

  for (const userId of userIds) {
    const mine = schedules.filter((s) => s.userId === userId);
    const days: Record<string, DayShift> = {};
    for (let t = utcDay(from); t <= utcDay(to); t += DAY) {
      const k = keyOf(new Date(t));
      const o = overrideBy.get(`${userId}|${k}`);
      if (o) { days[k] = toDay(o.shift, { override: true }); continue; }

      let current = null as (typeof mine)[number] | null;
      for (const s of mine) if (utcDay(s.effectiveDate) <= t) current = s;
      if (!current) continue;

      const holiday = holidayByDay.get(k);
      if (holiday) {
        days[k] = { code: "OFF", name: "Libur", color: "#9ca3af", isOff: true, startTime: null, endTime: null, holiday };
        continue;
      }
      if (current.type === "MANUAL" || !current.pattern) {
        days[k] = { code: "?", name: "Jadwal manual", color: "#d1d5db", isOff: false, startTime: null, endTime: null, manual: true };
        continue;
      }
      const p = current.pattern;
      const offset = Math.round((t - utcDay(p.startDate)) / DAY);
      const index = ((offset % p.cycleDays) + p.cycleDays) % p.cycleDays;
      const shift = p.days.find((d) => d.dayIndex === index)?.shift;
      if (shift) days[k] = toDay(shift);
    }
    result[userId] = days;
  }
  return result;
}

// Versi satu karyawan, dipakai di profil karyawan.
export async function getShiftCalendar(userId: string, from: Date, to: Date) {
  return (await getShiftCalendars([userId], from, to))[userId] ?? {};
}
