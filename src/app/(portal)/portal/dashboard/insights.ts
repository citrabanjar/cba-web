import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/utils";
import { loadRoster, unfilledIn } from "../admin/schedule/roster";

const DAY = 86_400_000;
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);
const keyOf = (d: Date) => d.toISOString().slice(0, 10);
const monthParam = (y: number, m: number) => {
  const d = new Date(Date.UTC(y, m, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};
const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

export type IndicatorIcon =
  | "schedule" | "users" | "building" | "present" | "absent" | "contract" | "leave" | "trip" | "birthday" | "holiday";
export type Tone = "blue" | "emerald" | "amber" | "violet" | "rose";

// Satu kartu kecil di Beranda. noteValue + note membentuk baris keterangan di bawah angka.
export type Indicator = {
  key: string; title: string; value: string | number; note: string; noteValue?: string | number;
  icon: IndicatorIcon; tone: Tone; href?: string; pinned?: boolean;
};

// Satu baris di kartu Tugas. Selesai kalau count = 0.
export type Task = {
  key: string; title: string; hint: string; count: number; unit: string;
  extra?: { count: number; unit: string }; href?: string;
};

// Hari ini menurut WIB, sebagai tanggal UTC tengah malam (sama dengan kolom @db.Date).
function todayDate() {
  const text = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
  return new Date(`${text}T00:00:00Z`);
}

// Semua data untuk kartu indikator dan kartu tugas di Beranda admin.
export async function loadInsights() {
  const today = todayDate();
  const todayKey = keyOf(today);
  const tomorrowKey = keyOf(addDays(today, 1));
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const employee = { role: { not: "SUPER_ADMIN" as const } };

  const [
    thisMonth, nextMonth, active, joinedThisYear, departments, presentToday, presentYesterday,
    attendanceToday, incomplete, leaves, trips, expiring60, expiring30, birthdays, nextHoliday, holidaysNextYear,
  ] = await Promise.all([
    loadRoster(monthParam(year, month), true),
    loadRoster(monthParam(year, month + 1), true),
    prisma.user.count({ where: { ...employee, isActive: true } }),
    prisma.user.count({ where: { ...employee, joinDate: { gte: yearStart } } }),
    prisma.department.count(),
    prisma.attendance.count({ where: { date: today, status: { in: ["HADIR", "DINAS"] } } }),
    prisma.attendance.count({ where: { date: addDays(today, -1), status: { in: ["HADIR", "DINAS"] } } }),
    prisma.attendance.findMany({ where: { date: today }, select: { userId: true } }),
    // Absen tidak lengkap 30 hari terakhir (lupa check-out atau lupa check-in).
    prisma.attendance.findMany({
      where: {
        date: { gte: addDays(today, -30), lt: today },
        OR: [{ checkIn: { not: null }, checkOut: null }, { checkIn: null, checkOut: { not: null } }],
      },
      orderBy: { date: "asc" }, select: { userId: true },
    }),
    prisma.leaveRequest.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, select: { userId: true } }),
    prisma.businessTrip.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, select: { userId: true } }),
    prisma.user.count({
      where: { ...employee, isActive: true, employmentStatus: "KONTRAK", contractEndDate: { gte: today, lte: addDays(today, 60) } },
    }),
    prisma.user.findMany({
      where: { ...employee, isActive: true, employmentStatus: "KONTRAK", contractEndDate: { lte: addDays(today, 30) } },
      orderBy: { contractEndDate: "asc" }, select: { id: true },
    }),
    prisma.user.findMany({ where: { ...employee, isActive: true, birthDate: { not: null } }, select: { name: true, birthDate: true } }),
    prisma.holiday.findFirst({ where: { date: { gte: today } }, orderBy: { date: "asc" } }),
    prisma.holiday.count({ where: { date: { gte: new Date(Date.UTC(year + 1, 0, 1)), lt: new Date(Date.UTC(year + 2, 0, 1)) } } }),
  ]);

  const now = unfilledIn(thisMonth);
  const next = unfilledIn(nextMonth);
  const unfilledSoon = (now.byDate.get(todayKey) ?? 0) + (now.byDate.get(tomorrowKey) ?? next.byDate.get(tomorrowKey) ?? 0);

  // Karyawan yang hari ini terjadwal masuk (bukan libur) tapi belum ada catatan absensi.
  const checkedIn = new Set(attendanceToday.map((a) => a.userId));
  const scheduledToday = thisMonth.rows.filter((r) => {
    const d = r.days[todayKey];
    return d && !d.isOff && !d.manual && !d.holiday;
  });
  const notCheckedIn = scheduledToday.filter((r) => !checkedIn.has(r.id)).length;

  const birthdayThisMonth = birthdays
    .filter((b) => b.birthDate!.getUTCMonth() === month)
    .sort((a, b) => a.birthDate!.getUTCDate() - b.birthDate!.getUTCDate());
  const nextBirthday = birthdayThisMonth.find((b) => b.birthDate!.getUTCDate() >= today.getUTCDate());

  const profile = (userId?: string) => (userId ? `/portal/admin/karyawan/${userId}` : undefined);
  const rosterHref = (offset: number) => `/portal/admin/schedule?tab=jadwal&bulan=${monthParam(year, month + offset)}`;
  const absentToday = Math.max(0, active - presentToday);

  const indicators: Indicator[] = [
    now.total > 0
      ? { key: "schedule", title: "Shift Belum Diisi", value: now.total, noteValue: now.people, note: "karyawan · hari kerja bulan ini", icon: "schedule", tone: "amber", href: rosterHref(0), pinned: true }
      : { key: "schedule", title: "Shift Bulan Ini", value: "✓", note: "Semua shift sudah terisi", icon: "schedule", tone: "emerald", href: rosterHref(0), pinned: true },
    { key: "present", title: "Hadir Hari Ini", value: presentToday, noteValue: presentYesterday, note: "hadir kemarin", icon: "present", tone: "emerald" },
    { key: "absent", title: "Tidak Hadir Hari Ini", value: absentToday, noteValue: Math.max(0, active - presentYesterday), note: "tidak hadir kemarin", icon: "absent", tone: "rose" },
    { key: "total", title: "Total Karyawan", value: active, noteValue: joinedThisYear, note: "masuk tahun ini", icon: "users", tone: "blue", href: "/portal/admin/karyawan" },
    { key: "contract", title: "Kontrak Berakhir", value: expiring60, note: "dalam 60 hari ke depan", icon: "contract", tone: "amber", href: "/portal/admin/karyawan" },
    { key: "leave", title: "Cuti Menunggu", value: leaves.length, note: "pengajuan belum diputus", icon: "leave", tone: "violet", href: profile(leaves[0]?.userId) },
    { key: "trip", title: "Dinas Menunggu", value: trips.length, note: "pengajuan belum diputus", icon: "trip", tone: "violet", href: profile(trips[0]?.userId) },
    { key: "departments", title: "Departemen", value: departments, note: "Termasuk grup di dalamnya", icon: "building", tone: "violet", href: "/portal/admin/setup" },
    {
      key: "birthday", title: "Ulang Tahun Bulan Ini", value: birthdayThisMonth.length,
      noteValue: nextBirthday ? `${nextBirthday.name} (${nextBirthday.birthDate!.getUTCDate()})` : undefined,
      note: nextBirthday ? "berikutnya" : "Tidak ada lagi bulan ini", icon: "birthday", tone: "rose",
    },
    nextHoliday
      ? {
          key: "holiday", title: "Libur Berikutnya", value: Math.round((nextHoliday.date.getTime() - today.getTime()) / DAY),
          noteValue: `${formatDate(nextHoliday.date)} · ${nextHoliday.name}`, note: "hari lagi", icon: "holiday", tone: "blue", href: "/portal/admin/schedule",
        }
      : { key: "holiday", title: "Libur Berikutnya", value: "—", note: "Belum ada libur terjadwal", icon: "holiday", tone: "blue", href: "/portal/admin/schedule" },
  ];

  const daily: Task[] = [
    { key: "shift-soon", title: "Isi shift hari ini & besok", hint: "Karyawan tanpa shift tidak bisa dinilai kehadirannya.", count: unfilledSoon, unit: "hari kerja belum ada shift", href: rosterHref(0) },
    { key: "attendance", title: "Pantau absensi hari ini", hint: "Karyawan yang terjadwal masuk tapi belum check-in.", count: notCheckedIn, unit: "karyawan belum check-in", extra: { count: scheduledToday.length, unit: "terjadwal" } },
    { key: "incomplete", title: "Selesaikan absen tidak lengkap", hint: "Lupa check-out atau check-in, 30 hari terakhir. Putuskan: lupa absen, potong cuti, atau mangkir.", count: incomplete.length, unit: "absen belum lengkap", href: profile(incomplete[0]?.userId) },
    { key: "leave", title: "Tinjau pengajuan cuti", hint: "Pengajuan yang menunggu keputusan.", count: leaves.length, unit: "pengajuan menunggu", href: profile(leaves[0]?.userId) },
    { key: "trip", title: "Tinjau pengajuan dinas luar", hint: "Pengajuan yang menunggu keputusan.", count: trips.length, unit: "pengajuan menunggu", href: profile(trips[0]?.userId) },
  ];

  const monthly: Task[] = [
    { key: "shift-month", title: `Lengkapi shift ${MONTHS[month]}`, hint: "Semua hari kerja bulan ini harus punya shift.", count: now.total, unit: "hari kerja", extra: { count: now.people, unit: "karyawan" }, href: rosterHref(0) },
    { key: "shift-next", title: `Siapkan shift ${MONTHS[(month + 1) % 12]}`, hint: "Isi jadwal Security dan karyawan jadwal manual sebelum bulan berganti.", count: next.total, unit: "hari kerja", extra: { count: next.people, unit: "karyawan" }, href: rosterHref(1) },
    { key: "contract", title: "Tindak lanjuti kontrak berakhir", hint: "Kontrak yang berakhir dalam 30 hari atau sudah lewat: perpanjang, angkat tetap, atau akhiri.", count: expiring30.length, unit: "kontrak", href: profile(expiring30[0]?.id) },
    ...(month >= 9
      ? [{ key: "holiday", title: `Input kalender libur ${year + 1}`, hint: "Hari libur nasional dan cuti bersama tahun depan.", count: holidaysNextYear ? 0 : 1, unit: "belum ada hari libur", href: "/portal/admin/schedule" }]
      : []),
  ];

  return { indicators, daily, monthly };
}
