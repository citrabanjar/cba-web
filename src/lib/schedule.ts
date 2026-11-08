import { prisma } from "@/lib/prisma";

export type DayShift = {
  code: string; name: string; color: string; isOff: boolean;
  startTime: string | null; endTime: string | null;
  holiday?: string; // nama hari libur kalau tanggal itu libur
  manual?: boolean; // karyawan jadwal manual (Security), shift belum diisi per tanggal
};

const DAY = 86_400_000;
const keyOf = (d: Date) => d.toISOString().slice(0, 10);
const utcDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

// Shift karyawan untuk setiap tanggal dalam rentang [from, to] (tanggal UTC tengah malam).
// Jadwal yang berlaku pada suatu tanggal adalah baris EmployeeSchedule terbaru yang
// tanggal berlakunya <= tanggal itu. Hari libur perusahaan selalu menjadi OFF.
export async function getShiftCalendar(userId: string, from: Date, to: Date) {
  const [schedules, holidays] = await Promise.all([
    prisma.employeeSchedule.findMany({
      where: { userId, effectiveDate: { lte: to } },
      orderBy: { effectiveDate: "asc" },
      include: { pattern: { include: { days: { include: { shift: true } } } } },
    }),
    prisma.holiday.findMany({ where: { date: { gte: from, lte: to } } }),
  ]);
  const holidayByDay = new Map(holidays.map((h) => [keyOf(h.date), h.name]));
  const result: Record<string, DayShift> = {};
  if (schedules.length === 0) return result;

  for (let t = utcDay(from); t <= utcDay(to); t += DAY) {
    const day = new Date(t);
    const k = keyOf(day);
    let current = null as (typeof schedules)[number] | null;
    for (const s of schedules) if (utcDay(s.effectiveDate) <= t) current = s;
    if (!current) continue;

    const holiday = holidayByDay.get(k);
    if (holiday) {
      result[k] = { code: "OFF", name: "Libur", color: "#9ca3af", isOff: true, startTime: null, endTime: null, holiday };
      continue;
    }
    if (current.type === "MANUAL" || !current.pattern) {
      result[k] = { code: "?", name: "Jadwal manual", color: "#d1d5db", isOff: false, startTime: null, endTime: null, manual: true };
      continue;
    }
    const p = current.pattern;
    const offset = Math.round((t - utcDay(p.startDate)) / DAY);
    const index = ((offset % p.cycleDays) + p.cycleDays) % p.cycleDays;
    const shift = p.days.find((d) => d.dayIndex === index)?.shift;
    if (!shift) continue;
    result[k] = {
      code: shift.code, name: shift.name, color: shift.color, isOff: shift.isOff,
      startTime: shift.startTime, endTime: shift.endTime,
    };
  }
  return result;
}
