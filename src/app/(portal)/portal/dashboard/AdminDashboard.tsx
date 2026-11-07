import Link from "next/link";
import { ArrowRight, Building2, CalendarClock, Clock, UserCheck, UserX, Users } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/utils";
import { T } from "@/components/i18n";

const DAY = 24 * 60 * 60 * 1000;
const PRESENT = ["HADIR", "DINAS"] as const;
const STATUS_LABEL: Record<string, string> = { TETAP: "Tetap", KONTRAK: "Kontrak", PROBATION: "Probation" };

// Kolom tanggal absensi tersimpan tengah malam UTC, jadi "hari ini" dihitung dalam WIB lalu dijadikan UTC.
function todayDate() {
  const text = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
  return new Date(`${text}T00:00:00Z`);
}
const addDays = (date: Date, days: number) => new Date(date.getTime() + days * DAY);
const hoursBetween = (start: Date, end: Date) => Math.max(0, (end.getTime() - start.getTime()) / 3_600_000);

function change(current: number, previous: number) {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 100);
}

function ChangeChip({ value, label }: { value: number | null; label: string }) {
  if (value === null) return <p className="mt-1 text-[11px] text-gray-400"><T>{label}</T></p>;
  const up = value >= 0;
  return (
    <p className="mt-1 flex items-center gap-1.5 text-[11px] text-gray-400">
      <span className={`rounded-md px-1.5 py-0.5 font-semibold ${up ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
        {up ? "+" : ""}{value}%
      </span>
      <T>{label}</T>
    </p>
  );
}

function Panel({
  icon: Icon, title, subtitle, action, children, className = "",
}: {
  icon: React.ElementType; title: string; subtitle: string;
  action?: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-gray-200 bg-white p-1.5 shadow-sm ${className}`}>
      <div className="flex items-start gap-2.5 px-2.5 py-2">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
          <Icon size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-gray-800"><T>{title}</T></h3>
          <p className="truncate text-[11px] text-gray-400"><T>{subtitle}</T></p>
        </div>
        {action}
      </div>
      <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-4">{children}</div>
    </section>
  );
}

function StatCard({
  icon, title, subtitle, value, href, chip,
}: {
  icon: React.ElementType; title: string; subtitle: string; value: number;
  href?: string; chip: React.ReactNode;
}) {
  return (
    <Panel icon={icon} title={title} subtitle={subtitle}>
      <div className="flex items-end justify-between gap-2">
        <div>
          <p className="text-3xl font-semibold tabular-nums text-gray-900">{value}</p>
          {chip}
        </div>
        {href && (
          <Link href={href} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-700 hover:border-brand hover:text-brand">
            <T>Detail</T> <ArrowRight size={12} />
          </Link>
        )}
      </div>
    </Panel>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="flex h-44 items-center justify-center text-center text-sm text-gray-400"><T>{text}</T></p>;
}

// Grafik garis jam kerja harian dengan garis putus-putus untuk rata-ratanya.
// Hari tanpa data absensi dilewati, bukan dianggap nol jam.
export function HoursChart({ days, average }: { days: { label: string; hours: number | null }[]; average: number }) {
  const W = 640, H = 190, PAD = 28, RIGHT = 28, TOP = 10;
  const max = Math.max(10, ...days.map((d) => d.hours ?? 0));
  const x = (i: number) => PAD + 14 + (i * (W - PAD - 14 - RIGHT)) / (days.length - 1);
  const y = (h: number) => TOP + (H - TOP - 24) * (1 - h / max);
  const filled = days.flatMap((d, i) => (d.hours === null ? [] : [[x(i), y(d.hours)] as const]));
  const line = filled.map(([px, py], i) => `${i ? "L" : "M"}${px},${py}`).join(" ");
  const area = filled.length
    ? `${line} L${filled[filled.length - 1][0]},${y(0)} L${filled[0][0]},${y(0)} Z`
    : "";
  const points = days.map((d, i) => [x(i), y(d.hours ?? 0)] as const);
  const ticks = [0, Math.round(max / 2), Math.round(max)];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-48 w-full" role="img" aria-label="Grafik jam kerja harian">
      <defs>
        <linearGradient id="hoursFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--color-brand)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="var(--color-brand)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD} x2={W - RIGHT} y1={y(t)} y2={y(t)} stroke="#e5e7eb" />
          <text x={PAD - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#9ca3af">{t}</text>
        </g>
      ))}
      <path d={area} fill="url(#hoursFill)" />
      <path d={line} fill="none" stroke="var(--color-brand)" strokeWidth="2.5" strokeLinejoin="round" />
      {average > 0 && (
        <g>
          <line x1={PAD} x2={W - RIGHT} y1={y(average)} y2={y(average)} stroke="var(--color-ink)" strokeDasharray="3 4" />
          <rect x={PAD + 4} y={y(average) - 22} width="84" height="18" rx="4" fill="var(--color-ink)" />
          <text x={PAD + 46} y={y(average) - 9} textAnchor="middle" fontSize="11" fill="#fff">
            {`Rata-rata ${average.toFixed(1)} j`}
          </text>
        </g>
      )}
      {points.map(([px, py], i) => (
        <g key={days[i].label}>
          {days[i].hours !== null && <circle cx={px} cy={py} r="3.5" fill="#fff" stroke="var(--color-brand)" strokeWidth="2" />}
          <text x={px} y={H - 4} textAnchor="middle" fontSize="11" fill="#9ca3af">{days[i].label}</text>
        </g>
      ))}
    </svg>
  );
}

export function MonthBars({ months }: { months: { label: string; regular: number; extra: number }[] }) {
  const max = Math.max(1, ...months.flatMap((m) => [m.regular, m.extra]));
  return (
    <div className="flex h-44 items-end justify-around gap-4 pt-2">
      {months.map((m) => (
        <div key={m.label} className="flex flex-col items-center gap-2">
          <div className="flex h-36 items-end gap-1.5">
            <div className="w-7 rounded-t-md bg-brand" style={{ height: `${(m.regular / max) * 100}%` }} title={`${Math.round(m.regular)} jam`} />
            <div className="w-7 rounded-t-md bg-sky-400" style={{ height: `${(m.extra / max) * 100}%` }} title={`${Math.round(m.extra)} jam`} />
          </div>
          <span className="text-[11px] text-gray-400">{m.label}</span>
        </div>
      ))}
    </div>
  );
}

export default async function AdminDashboard({ canSeeSetup }: { canSeeSetup: boolean }) {
  const today = todayDate();
  const yearStart = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
  const lastYearStart = new Date(Date.UTC(today.getUTCFullYear() - 1, 0, 1));
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 2, 1));
  const employee = { role: { not: "SUPER_ADMIN" as const } };

  const [active, joinedThisYear, joinedLastYear, departments, presentToday, presentYesterday, worked, recent, expiring] =
    await Promise.all([
      prisma.user.count({ where: { ...employee, isActive: true } }),
      prisma.user.count({ where: { ...employee, joinDate: { gte: yearStart } } }),
      prisma.user.count({ where: { ...employee, joinDate: { gte: lastYearStart, lt: yearStart } } }),
      prisma.department.count(),
      prisma.attendance.count({ where: { date: today, status: { in: [...PRESENT] } } }),
      prisma.attendance.count({ where: { date: addDays(today, -1), status: { in: [...PRESENT] } } }),
      prisma.attendance.findMany({
        where: { date: { gte: monthStart }, checkIn: { not: null }, checkOut: { not: null } },
        select: { date: true, checkIn: true, checkOut: true },
      }),
      prisma.user.findMany({
        where: { ...employee, isActive: true },
        orderBy: [{ joinDate: { sort: "desc", nulls: "last" } }],
        take: 6,
        select: {
          id: true, employeeId: true, name: true, position: true, employmentStatus: true, joinDate: true,
          department: { select: { name: true } },
        },
      }),
      prisma.user.count({
        where: {
          ...employee, isActive: true, employmentStatus: "KONTRAK",
          contractEndDate: { gte: today, lte: addDays(today, 60) },
        },
      }),
    ]);

  const absentToday = Math.max(0, active - presentToday);
  const absentYesterday = Math.max(0, active - presentYesterday);

  const hoursByDay = new Map<string, number[]>();
  const months = [0, 1, 2].map((i) => {
    const start = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + i, 1));
    return { start, label: formatDate(start).slice(3, 6), regular: 0, extra: 0 };
  });
  for (const row of worked) {
    const hours = hoursBetween(row.checkIn!, row.checkOut!);
    const key = row.date.toISOString().slice(0, 10);
    hoursByDay.set(key, [...(hoursByDay.get(key) ?? []), hours]);
    const month = months.findLast((m) => row.date >= m.start);
    if (month) {
      month.regular += Math.min(hours, 8);
      month.extra += Math.max(0, hours - 8);
    }
  }

  const avg = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
  const week = [6, 5, 4, 3, 2, 1, 0].map((back) => {
    const date = addDays(today, -back);
    return { label: formatDate(date).slice(0, 6), hours: avg(hoursByDay.get(date.toISOString().slice(0, 10)) ?? []) };
  });
  const weekHours = week.flatMap((d) => (d.hours === null ? [] : [d.hours]));
  const weekAverage = avg(weekHours) ?? 0;
  const totalRegular = months.reduce((s, m) => s + m.regular, 0);
  const totalExtra = months.reduce((s, m) => s + m.extra, 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Users} title="Total Karyawan" subtitle="Karyawan yang masih aktif"
          value={active} href="/portal/admin/karyawan"
          chip={<ChangeChip value={change(joinedThisYear, joinedLastYear)} label={`${joinedThisYear} masuk tahun ini`} />}
        />
        <StatCard
          icon={Building2} title="Departemen" subtitle="Divisi di perusahaan"
          value={departments} href={canSeeSetup ? "/portal/admin/setup" : undefined}
          chip={<ChangeChip value={null} label="Termasuk grup di dalamnya" />}
        />
        <StatCard
          icon={UserCheck} title="Hadir Hari Ini" subtitle="Hadir atau dinas luar"
          value={presentToday}
          chip={<ChangeChip value={change(presentToday, presentYesterday)} label="dibanding kemarin" />}
        />
        <StatCard
          icon={UserX} title="Tidak Hadir Hari Ini" subtitle="Belum absen, izin, sakit, atau cuti"
          value={absentToday}
          chip={<ChangeChip value={change(absentToday, absentYesterday)} label="dibanding kemarin" />}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <Panel icon={Clock} title="Rata-rata Jam Kerja" subtitle="Rata-rata jam kerja seluruh karyawan, 7 hari terakhir">
          <div className="flex items-end justify-between">
            <p className="text-3xl font-semibold tabular-nums text-gray-900">
              {weekAverage.toFixed(1)} <span className="text-base font-medium text-gray-500"><T>jam</T></span>
            </p>
            <span className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-[11px] text-gray-600"><T>7 hari terakhir</T></span>
          </div>
          {weekHours.length ? <HoursChart days={week} average={weekAverage} /> : <Empty text="Belum ada data absensi lengkap minggu ini." />}
        </Panel>

        <Panel icon={CalendarClock} title="Jam Kerja per Bulan" subtitle="Total jam kerja seluruh karyawan, 3 bulan terakhir">
          <div className="flex gap-6">
            <div>
              <p className="flex items-center gap-1.5 text-[11px] text-gray-500"><span className="h-2.5 w-2.5 rounded-sm bg-brand" /><T>Jam kerja</T></p>
              <p className="text-lg font-semibold tabular-nums text-gray-900">{Math.round(totalRegular)} <span className="text-xs font-medium text-gray-500"><T>jam</T></span></p>
            </div>
            <div>
              <p className="flex items-center gap-1.5 text-[11px] text-gray-500"><span className="h-2.5 w-2.5 rounded-sm bg-sky-400" /><T>Lebih dari 8 jam</T></p>
              <p className="text-lg font-semibold tabular-nums text-gray-900">{Math.round(totalExtra)} <span className="text-xs font-medium text-gray-500"><T>jam</T></span></p>
            </div>
          </div>
          {worked.length ? <MonthBars months={months} /> : <Empty text="Belum ada data absensi lengkap." />}
        </Panel>
      </div>

      <Panel
        icon={Users} title="Karyawan Terbaru" subtitle="Karyawan aktif dengan tanggal masuk terbaru"
        action={
          <div className="flex items-center gap-2">
            {expiring > 0 && (
              <span className="rounded-lg bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-800">
                {expiring} <T>kontrak berakhir dalam 60 hari</T>
              </span>
            )}
            <Link href="/portal/admin/karyawan" className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-700 hover:border-brand hover:text-brand">
              <T>Lihat semua</T> <ArrowRight size={12} />
            </Link>
          </div>
        }
      >
        <div className="-m-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400">
                <th className="px-4 py-2.5 font-medium"><T>Employee ID</T></th>
                <th className="px-4 py-2.5 font-medium"><T>Nama</T></th>
                <th className="hidden px-4 py-2.5 font-medium md:table-cell"><T>Jabatan</T></th>
                <th className="hidden px-4 py-2.5 font-medium lg:table-cell"><T>Departemen</T></th>
                <th className="px-4 py-2.5 font-medium"><T>Status</T></th>
                <th className="hidden px-4 py-2.5 font-medium sm:table-cell"><T>Tanggal Masuk</T></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {recent.map((e) => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-gray-500">{e.employeeId ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    <Link href={`/portal/admin/karyawan/${e.id}`} className="font-medium text-gray-800 hover:text-brand">{e.name}</Link>
                  </td>
                  <td className="hidden px-4 py-2.5 text-gray-600 md:table-cell">{e.position ?? "—"}</td>
                  <td className="hidden max-w-64 truncate px-4 py-2.5 text-gray-600 lg:table-cell">{e.department?.name ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                      e.employmentStatus === "TETAP" ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-800"
                    }`}>
                      <T>{STATUS_LABEL[e.employmentStatus] ?? e.employmentStatus}</T>
                    </span>
                  </td>
                  <td className="hidden whitespace-nowrap px-4 py-2.5 text-gray-600 sm:table-cell">{e.joinDate ? formatDate(e.joinDate) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
