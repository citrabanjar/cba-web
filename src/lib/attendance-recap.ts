// Rekap kehadiran, cuti (leave), dinas, dan lembur per karyawan untuk rentang tanggal tertentu.
// Dipakai menu Panel Admin -> TIME -> Rekap (Admin berhak Absensi & Cuti, dan Super Admin).
// - Hari kerja = hari dengan shift (bukan OFF / libur).
// - Terlambat / pulang cepat dinilai dari jam shift + toleransi (sama dengan Proses Gaji).
// - Cuti = pengajuan cuti yang disetujui, dihitung hari kerja (setengah hari = 0,5).
// - Lembur = jam dibayar (per 1 jam penuh sampai absen pulang, tanpa istirahat), dipisah hari kerja / hari libur.
import { prisma } from "@/lib/prisma";
import { getShiftCalendars } from "@/lib/schedule";
import { dayPenalty } from "@/lib/attendance-penalty";
import { countLeaveDays } from "@/lib/leave-balance";
import { isRestDay, OT_APPROVED, paidHours, shiftWindow } from "@/lib/overtime";

const DAY = 86_400_000;
const keyOf = (d: Date) => d.toISOString().slice(0, 10);
const hm = (d: Date | null) => (d ? new Date(d.getTime() + 7 * 3600_000).toISOString().slice(11, 16) : null);
const LEGACY: Record<string, string> = { TAHUNAN: "Cuti Tahunan", SAKIT: "Sakit", MELAHIRKAN: "Melahirkan", PENTING: "Keperluan Penting", LAINNYA: "Lainnya" };

export type RecapRow = {
  userId: string; name: string; employeeId: string | null; department: string | null;
  workDays: number; present: number; late: number; lateMinutes: number; early: number; earlyHours: number;
  noCheckout: number; alpha: number; izin: number; sakit: number;
  leaveDays: number; leaveByType: Record<string, number>; tripDays: number;
  otCount: number; otWorkHours: number; otRestHours: number;
};
export type RecapDay = {
  date: string; shift: string; checkIn: string | null; checkOut: string | null; status: string | null;
  lateMinutes: number; earlyHours: number; leave: string | null; trip: string | null; overtime: string | null; otPaid: number | null;
};

export async function buildRecap(userIds: string[], from: Date, to: Date, withDays = false) {
  if (!userIds.length) return { rows: [] as RecapRow[], days: [] as RecapDay[] };
  const [users, cal, atts, leaves, trips, ots] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, employeeId: true, department: { select: { name: true } } }, orderBy: [{ employeeNo: "asc" }, { name: "asc" }] }),
    getShiftCalendars(userIds, from, to),
    prisma.attendance.findMany({ where: { userId: { in: userIds }, date: { gte: from, lte: to } }, select: { userId: true, date: true, checkIn: true, checkOut: true, status: true } }),
    prisma.leaveRequest.findMany({
      where: { userId: { in: userIds }, status: "APPROVED", startDate: { lte: to }, endDate: { gte: from } },
      select: { userId: true, startDate: true, endDate: true, type: true, halfDay: true, policy: { select: { name: true } } },
    }),
    prisma.businessTrip.findMany({
      where: { userId: { in: userIds }, status: "APPROVED", startDate: { lte: to }, endDate: { gte: from } },
      select: { userId: true, startDate: true, endDate: true, destination: true },
    }),
    prisma.overtime.findMany({ where: { userId: { in: userIds }, status: { in: OT_APPROVED }, date: { gte: from, lte: to } } }),
  ]);
  const attBy = new Map(atts.map((a) => [`${a.userId}|${keyOf(a.date)}`, a]));
  const clip = (a: Date, b: Date) => ({ a: a < from ? from : a, b: b > to ? to : b });
  const days: RecapDay[] = [];

  const rows: RecapRow[] = [];
  for (const u of users) {
    const r: RecapRow = {
      userId: u.id, name: u.name, employeeId: u.employeeId, department: u.department?.name ?? null,
      workDays: 0, present: 0, late: 0, lateMinutes: 0, early: 0, earlyHours: 0, noCheckout: 0, alpha: 0, izin: 0, sakit: 0,
      leaveDays: 0, leaveByType: {}, tripDays: 0, otCount: 0, otWorkHours: 0, otRestHours: 0,
    };
    const myCal = cal[u.id] ?? {};
    const leaveOn = new Map<string, string>(), tripOn = new Map<string, string>(), otOn = new Map<string, { text: string; paid: number }>();

    for (const l of leaves.filter((x) => x.userId === u.id)) {
      const { a, b } = clip(l.startDate, l.endDate);
      const name = l.policy?.name ?? LEGACY[l.type] ?? l.type;
      const days = l.halfDay ? 0.5 : await countLeaveDays(u.id, a, b, "HARI_KERJA", { halfShifts: true });
      r.leaveDays += days;
      r.leaveByType[name] = (r.leaveByType[name] ?? 0) + days;
      for (let t = a.getTime(); t <= b.getTime(); t += DAY) leaveOn.set(keyOf(new Date(t)), l.halfDay ? `${name} (½ hari)` : name);
    }
    for (const t of trips.filter((x) => x.userId === u.id)) {
      const { a, b } = clip(t.startDate, t.endDate);
      for (let x = a.getTime(); x <= b.getTime(); x += DAY) { tripOn.set(keyOf(new Date(x)), t.destination); }
    }
    r.tripDays = tripOn.size;
    for (const o of ots.filter((x) => x.userId === u.id)) {
      const k = keyOf(o.date), s = myCal[k];
      const isRest = isRestDay(s, o.date);
      const h = paidHours(o, attBy.get(`${u.id}|${k}`), shiftWindow(o.date, s), isRest);
      r.otCount++;
      if (isRest) r.otRestHours += h; else r.otWorkHours += h;
      otOn.set(k, { text: `${o.startTime}–${o.endTime}`, paid: h });
    }

    for (let t = from.getTime(); t <= to.getTime(); t += DAY) {
      const k = keyOf(new Date(t)), s = myCal[k], a = attBy.get(`${u.id}|${k}`);
      const working = !!s && !s.isOff && !s.holiday && !!s.startTime && !!s.endTime;
      if (working) r.workDays++;
      if (a?.status === "HADIR") {
        r.present++;
        if (a.checkIn && !a.checkOut) r.noCheckout++;
      }
      if (a?.status === "ALPHA") r.alpha++;
      if (a?.status === "IZIN") r.izin++;
      if (a?.status === "SAKIT") r.sakit++;
      const p = a && (a.status === "HADIR") ? dayPenalty(s, k, a.checkIn, a.checkOut) : null;
      if (p?.late) { r.late++; r.lateMinutes += p.lateMinutes; }
      if (p && p.earlyHours > 0) { r.early++; r.earlyHours += p.earlyHours; }
      if (withDays) {
        days.push({
          date: k, shift: !s ? "-" : s.holiday ? `Libur: ${s.holiday}` : s.isOff ? "OFF" : s.startTime ? `${s.startTime}–${s.endTime}` : s.name,
          checkIn: hm(a?.checkIn ?? null), checkOut: hm(a?.checkOut ?? null), status: a?.status ?? null,
          lateMinutes: p?.late ? p.lateMinutes : 0, earlyHours: p?.earlyHours ?? 0,
          leave: leaveOn.get(k) ?? null, trip: tripOn.get(k) ?? null, overtime: otOn.get(k)?.text ?? null, otPaid: otOn.get(k)?.paid ?? null,
        });
      }
    }
    rows.push(r);
  }
  return { rows, days };
}
