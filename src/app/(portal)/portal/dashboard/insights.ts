import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { loadRoster, unfilledIn } from "../admin/schedule/roster";
import { getHiddenIndicators } from "@/lib/app-settings";
import { getShiftCalendars } from "@/lib/schedule";
import { dayPenalty } from "@/lib/attendance-penalty";

const DAY = 86_400_000;
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);
const keyOf = (d: Date) => d.toISOString().slice(0, 10);
const monthParam = (y: number, m: number) => {
  const d = new Date(Date.UTC(y, m, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};
const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

export type IndicatorIcon =
  | "schedule" | "users" | "building" | "present" | "absent" | "contract" | "leave" | "trip" | "loan" | "birthday" | "holiday" | "late";
export type Tone = "blue" | "emerald" | "amber" | "violet" | "rose";

// Satu kartu kecil di Beranda. noteValue + note membentuk baris keterangan di bawah angka.
// actionable = indikator pekerjaan: kartunya hilang dari running saat sudah beres (nilai 0).
export type Indicator = {
  key: string; title: string; value: string | number; note: string; noteValue?: string | number;
  icon: IndicatorIcon; tone: Tone; href?: string; pinned?: boolean; actionable?: boolean;
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
  const employee = { role: { not: "SUPER_ADMIN" as const } };

  const [
    thisMonth, nextMonth,
    attendanceToday, incomplete, leaves, trips, loans, expiring30, holidaysNextYear, indicators,
  ] = await Promise.all([
    loadRoster(monthParam(year, month), true),
    loadRoster(monthParam(year, month + 1), true),
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
    prisma.employeeLoan.findMany({ where: { status: { in: ["PENDING", "DISETUJUI"] } }, orderBy: { createdAt: "asc" }, select: { userId: true, status: true } }),
    prisma.user.findMany({
      where: { ...employee, isActive: true, employmentStatus: "KONTRAK", contractEndDate: { lte: addDays(today, 30) } },
      orderBy: { contractEndDate: "asc" }, select: { id: true },
    }),
    prisma.holiday.count({ where: { date: { gte: new Date(Date.UTC(year + 1, 0, 1)), lt: new Date(Date.UTC(year + 2, 0, 1)) } } }),
    loadIndicators(),
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

  const profile = (userId?: string) => (userId ? `/portal/admin/karyawan/${userId}` : undefined);
  const rosterHref = (offset: number) => `/portal/admin/schedule?tab=jadwal&bulan=${monthParam(year, month + offset)}`;
  // Pinjaman: pengajuan baru dan yang sudah disetujui tapi belum dicairkan; tautan ke tab Pinjaman profil.
  const loanRequests = loans.filter((l) => l.status === "PENDING");
  const loanToDisburse = loans.filter((l) => l.status === "DISETUJUI");
  const loanTab = (userId?: string) => (userId ? `/portal/admin/karyawan/${userId}?tab=pinjaman` : "/portal/admin/pinjaman");

  const daily: Task[] = [
    { key: "shift-soon", title: "Isi shift hari ini & besok", hint: "Karyawan tanpa shift tidak bisa dinilai kehadirannya.", count: unfilledSoon, unit: "hari kerja belum ada shift", href: rosterHref(0) },
    { key: "attendance", title: "Pantau absensi hari ini", hint: "Karyawan yang terjadwal masuk tapi belum check-in.", count: notCheckedIn, unit: "karyawan belum check-in", extra: { count: scheduledToday.length, unit: "terjadwal" } },
    { key: "incomplete", title: "Selesaikan absen tidak lengkap", hint: "Lupa check-out atau check-in, 30 hari terakhir. Putuskan: lupa absen, potong cuti, atau mangkir.", count: incomplete.length, unit: "absen belum lengkap", href: profile(incomplete[0]?.userId) },
    { key: "leave", title: "Tinjau pengajuan cuti", hint: "Diputus atasan langsung karyawan di menu Persetujuan.", count: leaves.length, unit: "pengajuan menunggu", href: "/portal/persetujuan" },
    { key: "trip", title: "Tinjau pengajuan dinas luar", hint: "Diputus atasan langsung karyawan di menu Persetujuan.", count: trips.length, unit: "pengajuan menunggu", href: "/portal/persetujuan" },
    { key: "loan", title: "Proses pengajuan pinjaman", hint: "Setujui atau tolak di tab Pinjaman profil karyawan.", count: loanRequests.length, unit: "pengajuan menunggu", href: loanTab(loanRequests[0]?.userId) },
    { key: "loan-disburse", title: "Cairkan pinjaman yang disetujui", hint: "Tandai Dicairkan setelah uang diberikan; angsuran baru dipotong setelah itu.", count: loanToDisburse.length, unit: "pinjaman menunggu pencairan", href: loanTab(loanToDisburse[0]?.userId) },
  ];

  const monthly: Task[] = [
    { key: "shift-month", title: `Lengkapi shift ${MONTHS[month]}`, hint: "Semua hari kerja bulan ini harus punya shift.", count: now.total, unit: "hari kerja", extra: { count: now.people, unit: "karyawan" }, href: rosterHref(0) },
    { key: "shift-next", title: `Siapkan shift ${MONTHS[(month + 1) % 12]}`, hint: "Isi jadwal Security dan karyawan jadwal manual sebelum bulan berganti.", count: next.total, unit: "hari kerja", extra: { count: next.people, unit: "karyawan" }, href: rosterHref(1) },
    { key: "contract", title: "Tindak lanjuti kontrak berakhir", hint: "Kontrak yang berakhir dalam 30 hari atau sudah lewat: perpanjang, angkat tetap, atau akhiri.", count: expiring30.length, unit: "kontrak", href: profile(expiring30[0]?.id) },
    ...(month >= 9
      ? [{ key: "holiday", title: `Input kalender libur ${year + 1}`, hint: "Hari libur nasional dan cuti bersama tahun depan.", count: holidaysNextYear ? 0 : 1, unit: "belum ada hari libur", href: "/portal/admin/schedule" }]
      : []),
  ];

  const data = await loadDataTasks();
  return { indicators, daily, monthly, data };
}

// Kartu running indikator Beranda (Super Admin dan Admin). Yang dimatikan Super Admin di Pengaturan,
// dan indikator pekerjaan yang sudah beres (nilai 0), tidak ikut berjalan.
export async function loadIndicators(): Promise<Indicator[]> {
  const today = todayDate();
  const todayKey = keyOf(today);
  const active = { isActive: true, role: { not: "SUPER_ADMIN" as const } };
  const [hidden, leaveRunning, onLeave, checkIns, onTrip] = await Promise.all([
    getHiddenIndicators(),
    // Pengajuan cuti yang sedang berjalan: sejak diajukan karyawan sampai diputus (disetujui / ditolak / dibatalkan).
    prisma.leaveRequest.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, select: { userId: true } }),
    // Cuti disetujui yang mencakup hari ini.
    prisma.leaveRequest.findMany({
      where: { status: "APPROVED", startDate: { lte: today }, endDate: { gte: today }, user: active },
      orderBy: { startDate: "asc" }, select: { userId: true, user: { select: { name: true } } },
    }),
    // Absen masuk hari ini.
    prisma.attendance.findMany({
      where: { date: today, checkIn: { not: null }, user: active },
      orderBy: { checkIn: "asc" }, select: { userId: true, checkIn: true, checkOut: true, user: { select: { name: true } } },
    }),
    // Dinas luar disetujui yang mencakup hari ini.
    prisma.businessTrip.findMany({
      where: { status: "APPROVED", startDate: { lte: today }, endDate: { gte: today }, user: active },
      orderBy: { startDate: "asc" }, select: { userId: true, destination: true, user: { select: { name: true } } },
    }),
  ]);
  // Terlambat / tepat waktu dinilai dari jam masuk shift hari itu + toleransi terlambat shift.
  const cal = checkIns.length ? await getShiftCalendars(checkIns.map((a) => a.userId), today, today) : {};
  const late: string[] = [], onTime: string[] = [];
  for (const a of checkIns) {
    const p = dayPenalty(cal[a.userId]?.[todayKey], todayKey, a.checkIn, a.checkOut);
    if (!p) continue; // tanpa shift / libur: tidak dinilai
    (p.late ? late : onTime).push(a.user.name);
  }
  const leaveNames = [...new Map(onLeave.map((l) => [l.userId, l.user.name])).values()];
  const tripNames = [...new Map(onTrip.map((t) => [t.userId, t.user.name])).values()];
  const names = (list: string[]) => (list.length ? `${list.slice(0, 2).map((n) => n.split(" ")[0]).join(", ")}${list.length > 2 ? ` +${list.length - 2}` : ""}` : undefined);
  const indicators: Indicator[] = [
    {
      key: "cuti-hari-ini", title: "Cuti Hari Ini", value: leaveNames.length, noteValue: names(leaveNames),
      note: leaveNames.length ? "sedang cuti" : "Tidak ada yang cuti", icon: "holiday", tone: "violet", href: "/portal/admin/leave",
    },
    {
      key: "dinas-hari-ini", title: "Dinas Hari Ini", value: tripNames.length, noteValue: names(tripNames),
      note: tripNames.length ? "sedang dinas luar" : "Tidak ada yang dinas", icon: "trip", tone: "blue", href: "/portal/persetujuan",
    },
    {
      key: "terlambat-hari-ini", title: "Terlambat Hari Ini", value: late.length, noteValue: names(late),
      note: late.length ? "terlambat masuk" : "Belum ada yang terlambat", icon: "late", tone: "rose", href: "/portal/admin/schedule",
    },
    {
      key: "tepat-waktu-hari-ini", title: "Tepat Waktu Hari Ini", value: onTime.length, noteValue: late.length + onTime.length,
      note: "sudah check-in", icon: "present", tone: "emerald", href: "/portal/admin/schedule",
    },
    {
      key: "cuti-berjalan", title: "Pengajuan Cuti Berjalan", value: leaveRunning.length,
      noteValue: new Set(leaveRunning.map((l) => l.userId)).size, note: "karyawan · menunggu persetujuan",
      icon: "leave", tone: "violet", href: "/portal/persetujuan", actionable: true,
    },
  ];
  return indicators.filter((i) => !hidden.includes(i.key) && !(i.actionable && i.value === 0));
}

// Tugas kelengkapan data karyawan aktif: siapa saja yang datanya belum diperbarui.
// Tautan membuka profil karyawan pertama (urut nama) yang belum lengkap; setelah dilengkapi,
// tautan pindah ke karyawan berikutnya.
async function loadDataTasks(): Promise<Task[]> {
  const base = { isActive: true, role: { not: "SUPER_ADMIN" as const } };
  const checks: { key: string; title: string; hint: string; where: Prisma.UserWhereInput }[] = [
    { key: "photo", title: "Upload foto karyawan", hint: "Upload Foto di Data Karyawan bisa sekaligus satu folder; nama file = Employee ID.", where: { photo: { is: null } } },
    { key: "job", title: "Lengkapi departemen & jabatan", hint: "Dipakai di struktur organisasi dan filter jadwal.", where: { OR: [{ departmentId: null }, { position: null }, { position: "" }] } },
    { key: "manager", title: "Isi atasan langsung", hint: "Atasan yang memutus cuti, dinas, dan lupa absen. Karyawan yang punya bawahan tidak dihitung.", where: { managerId: null, reports: { none: {} } } },
    { key: "join", title: "Isi tanggal masuk", hint: "Dipakai untuk masa kerja dan hak cuti.", where: { joinDate: null } },
    { key: "contract", title: "Isi tanggal akhir kontrak", hint: "Karyawan kontrak tanpa tanggal berakhir tidak bisa diingatkan.", where: { employmentStatus: "KONTRAK", contractEndDate: null } },
    { key: "identity", title: "Lengkapi data pribadi", hint: "No. identitas, tanggal lahir, jenis kelamin, atau alamat masih kosong.", where: { OR: [{ ktpNumber: null }, { birthDate: null }, { gender: null }, { address: null }] } },
    { key: "bank", title: "Lengkapi rekening bank", hint: "Dibutuhkan untuk transfer gaji.", where: { OR: [{ bankName: null }, { bankAccount: null }, { bankAccount: "" }] } },
    { key: "emergency", title: "Isi kontak darurat", hint: "Nama dan nomor yang bisa dihubungi saat darurat.", where: { OR: [{ emergencyName: null }, { emergencyPhone: null }] } },
    { key: "tax", title: "Lengkapi status PTKP", hint: "Dibutuhkan untuk hitung PPh 21.", where: { ptkpStatus: null } },
    { key: "bpjs", title: "Lengkapi nomor BPJS", hint: "Nomor BPJS Ketenagakerjaan atau Kesehatan masih kosong.", where: { OR: [{ bpjsTkNumber: null }, { bpjsKesNumber: null }] } },
  ];
  const found = await Promise.all(checks.map((c) =>
    prisma.user.findMany({ where: { ...base, ...c.where }, orderBy: { name: "asc" }, select: { id: true } })));
  return checks.map((c, i) => ({
    key: `data-${c.key}`, title: c.title, hint: c.hint, count: found[i].length, unit: "karyawan",
    href: found[i][0] ? `/portal/admin/karyawan/${found[i][0].id}` : undefined,
  }));
}
