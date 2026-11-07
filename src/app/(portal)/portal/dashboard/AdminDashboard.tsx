import Link from "next/link";
import { ArrowRight, Building2, Clock, PieChart, UserCheck, UserX, Users } from "lucide-react";
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
  if (value === null) return <p className="mt-1.5 text-[11px] text-gray-400"><T>{label}</T></p>;
  const up = value >= 0;
  return (
    <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-gray-400">
      <span className={`rounded-md px-1.5 py-0.5 font-semibold ${up ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"}`}>
        {up ? "▲" : "▼"} {Math.abs(value)}%
      </span>
      <T>{label}</T>
    </p>
  );
}

// Warna ikon dan hiasan sudut untuk setiap kartu. Kartunya putih bersih, mengikuti gaya Admin Dashboard V2.
// Ikon berwarna penuh dengan gradasi, plus garis warna di bawah kartu angka.
const TONES = {
  blue: { icon: "bg-gradient-to-br from-brand to-rose-400 text-white shadow-md shadow-brand/30", glow: "from-rose-100", bar: "from-brand to-rose-400" },
  emerald: { icon: "bg-gradient-to-br from-emerald-500 to-teal-400 text-white shadow-md shadow-emerald-500/30", glow: "from-emerald-100", bar: "from-emerald-500 to-teal-400" },
  amber: { icon: "bg-gradient-to-br from-amber-500 to-orange-400 text-white shadow-md shadow-amber-500/30", glow: "from-amber-100", bar: "from-amber-500 to-orange-400" },
  violet: { icon: "bg-gradient-to-br from-ink to-slate-500 text-white shadow-md shadow-black/20", glow: "from-slate-100", bar: "from-ink to-slate-500" },
  rose: { icon: "bg-gradient-to-br from-rose-500 to-pink-400 text-white shadow-md shadow-rose-500/30", glow: "from-rose-100", bar: "from-rose-500 to-pink-400" },
};
type Tone = keyof typeof TONES;

const CARD = "relative overflow-hidden rounded-2xl border bg-white";

function Panel({
  icon: Icon, title, subtitle, action, children, tone = "blue",
}: {
  icon: React.ElementType; title: string; subtitle: string;
  action?: React.ReactNode; children: React.ReactNode; tone?: Tone;
}) {
  return (
    <section className={`${CARD} p-5`}>
      <div className="mb-4 flex items-start gap-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${TONES[tone].icon}`}>
          <Icon size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-semibold text-gray-900"><T>{title}</T></h3>
          <p className="truncate text-xs text-gray-400"><T>{subtitle}</T></p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function StatCard({
  icon: Icon, title, value, href, chip, tone,
}: {
  icon: React.ElementType; title: string; value: number; href?: string; chip: React.ReactNode; tone: Tone;
}) {
  const body = (
    <>
      <span aria-hidden className={`pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gradient-to-br to-transparent ${TONES[tone].glow}`} />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-gray-500"><T>{title}</T></p>
          <p className="mt-1 text-[28px] font-bold leading-tight tabular-nums text-gray-900">{value}</p>
        </div>
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${TONES[tone].icon}`}>
          <Icon size={20} />
        </span>
      </div>
      <div className="relative">{chip}</div>
      <span aria-hidden className={`absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r ${TONES[tone].bar}`} />
    </>
  );
  return href ? (
    <Link href={href} className={`${CARD} block p-5 transition-transform hover:-translate-y-0.5`}>{body}</Link>
  ) : (
    <section className={`${CARD} p-5`}>{body}</section>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="flex h-44 items-center justify-center text-center text-sm text-gray-400"><T>{text}</T></p>;
}

// Grafik garis jam kerja harian dengan garis putus-putus untuk rata-ratanya.
// Hari tanpa data absensi dilewati, bukan dianggap nol jam.
export function HoursChart({ days, average }: { days: { label: string; hours: number | null }[]; average: number }) {
  const W = 640, H = 200, PAD = 28, RIGHT = 28, TOP = 10;
  const max = Math.max(10, ...days.map((d) => d.hours ?? 0));
  const x = (i: number) => PAD + 14 + (i * (W - PAD - 14 - RIGHT)) / (days.length - 1);
  const y = (h: number) => TOP + (H - TOP - 24) * (1 - h / max);
  const filled = days.flatMap((d, i) => (d.hours === null ? [] : [[x(i), y(d.hours)] as const]));
  // Kurva halus: titik kendali di tengah antara dua titik.
  const line = filled.map(([px, py], i) => {
    if (i === 0) return `M${px},${py}`;
    const [qx, qy] = filled[i - 1];
    const mid = (qx + px) / 2;
    return `C${mid},${qy} ${mid},${py} ${px},${py}`;
  }).join(" ");
  const area = filled.length
    ? `${line} L${filled[filled.length - 1][0]},${y(0)} L${filled[0][0]},${y(0)} Z`
    : "";
  const ticks = [0, Math.round(max / 2), Math.round(max)];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-52 w-full" role="img" aria-label="Grafik jam kerja harian">
      <defs>
        <linearGradient id="hoursFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--color-brand)" stopOpacity="0.25" />
          <stop offset="100%" stopColor="var(--color-brand)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD} x2={W - RIGHT} y1={y(t)} y2={y(t)} stroke="#eef0f6" />
          <text x={PAD - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#9ca3af">{t}</text>
        </g>
      ))}
      <path d={area} fill="url(#hoursFill)" />
      <path d={line} fill="none" stroke="var(--color-brand)" strokeWidth="3" strokeLinecap="round" />
      {average > 0 && (
        <g>
          <line x1={PAD} x2={W - RIGHT} y1={y(average)} y2={y(average)} stroke="var(--color-ink)" strokeOpacity="0.5" strokeDasharray="3 4" />
          <rect x={W - RIGHT - 88} y={y(average) - 22} width="88" height="18" rx="9" fill="var(--color-ink)" />
          <text x={W - RIGHT - 44} y={y(average) - 9} textAnchor="middle" fontSize="11" fill="#fff">
            {`Rata-rata ${average.toFixed(1)} j`}
          </text>
        </g>
      )}
      {days.map((d, i) => (
        <g key={d.label}>
          {d.hours !== null && <circle cx={x(i)} cy={y(d.hours)} r="4" fill="#fff" stroke="var(--color-brand)" strokeWidth="2.5" />}
          <text x={x(i)} y={H - 4} textAnchor="middle" fontSize="11" fill="#9ca3af">{d.label}</text>
        </g>
      ))}
    </svg>
  );
}

const DONUT_COLORS = ["var(--color-brand)", "#38bdf8", "#f59e0b", "#a78bfa"];

// Grafik lingkaran komposisi status kerja karyawan aktif.
function Donut({ parts }: { parts: { label: string; value: number }[] }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  const R = 52, C = 2 * Math.PI * R;
  const lengths = parts.map((p) => (total ? (p.value / total) * C : 0));
  const starts = lengths.map((_, i) => lengths.slice(0, i).reduce((s, l) => s + l, 0));
  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row lg:flex-col xl:flex-row">
      <div className="relative h-36 w-36 shrink-0">
        <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90" role="img" aria-label="Grafik status karyawan">
          <circle cx="70" cy="70" r={R} fill="none" stroke="#eef0f6" strokeWidth="16" />
          {parts.map((p, i) => (
            <circle
              key={p.label} cx="70" cy="70" r={R} fill="none" strokeWidth="16" strokeLinecap="round"
              stroke={DONUT_COLORS[i % DONUT_COLORS.length]}
              strokeDasharray={`${Math.max(0, lengths[i] - 3)} ${C}`} strokeDashoffset={-starts[i]}
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold tabular-nums text-gray-900">{total}</span>
          <span className="text-[11px] text-gray-400"><T>karyawan</T></span>
        </div>
      </div>
      <ul className="w-full space-y-2.5">
        {parts.map((p, i) => (
          <li key={p.label} className="flex items-center gap-2 text-sm">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
            <span className="flex-1 text-gray-600"><T>{p.label}</T></span>
            <span className="font-semibold tabular-nums text-gray-900">{p.value}</span>
            <span className="w-10 text-right text-xs text-gray-400">{total ? Math.round((p.value / total) * 100) : 0}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function AdminDashboard({ canSeeSetup }: { canSeeSetup: boolean }) {
  const today = todayDate();
  const yearStart = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
  const lastYearStart = new Date(Date.UTC(today.getUTCFullYear() - 1, 0, 1));
  const employee = { role: { not: "SUPER_ADMIN" as const } };

  const [active, joinedThisYear, joinedLastYear, departments, presentToday, presentYesterday, worked, byStatus, recent, expiring] =
    await Promise.all([
      prisma.user.count({ where: { ...employee, isActive: true } }),
      prisma.user.count({ where: { ...employee, joinDate: { gte: yearStart } } }),
      prisma.user.count({ where: { ...employee, joinDate: { gte: lastYearStart, lt: yearStart } } }),
      prisma.department.count(),
      prisma.attendance.count({ where: { date: today, status: { in: [...PRESENT] } } }),
      prisma.attendance.count({ where: { date: addDays(today, -1), status: { in: [...PRESENT] } } }),
      prisma.attendance.findMany({
        where: { date: { gte: addDays(today, -6) }, checkIn: { not: null }, checkOut: { not: null } },
        select: { date: true, checkIn: true, checkOut: true },
      }),
      prisma.user.groupBy({ by: ["employmentStatus"], where: { ...employee, isActive: true }, _count: { _all: true } }),
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
  for (const row of worked) {
    const key = row.date.toISOString().slice(0, 10);
    hoursByDay.set(key, [...(hoursByDay.get(key) ?? []), hoursBetween(row.checkIn!, row.checkOut!)]);
  }
  const avg = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
  const week = [6, 5, 4, 3, 2, 1, 0].map((back) => {
    const date = addDays(today, -back);
    return { label: formatDate(date).slice(0, 6), hours: avg(hoursByDay.get(date.toISOString().slice(0, 10)) ?? []) };
  });
  const weekHours = week.flatMap((d) => (d.hours === null ? [] : [d.hours]));
  const weekAverage = avg(weekHours) ?? 0;

  const statusParts = ["TETAP", "KONTRAK", "PROBATION"]
    .map((status) => ({
      label: STATUS_LABEL[status],
      value: byStatus.find((r) => r.employmentStatus === status)?._count._all ?? 0,
    }))
    .filter((p) => p.value > 0 || p.label !== "Probation");

  return (
    <div className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Users} title="Total Karyawan" tone="blue" value={active} href="/portal/admin/karyawan"
          chip={<ChangeChip value={change(joinedThisYear, joinedLastYear)} label={`${joinedThisYear} masuk tahun ini`} />}
        />
        <StatCard
          icon={Building2} title="Departemen" tone="violet" value={departments}
          href={canSeeSetup ? "/portal/admin/setup" : undefined}
          chip={<ChangeChip value={null} label="Termasuk grup di dalamnya" />}
        />
        <StatCard
          icon={UserCheck} title="Hadir Hari Ini" tone="emerald" value={presentToday}
          chip={<ChangeChip value={change(presentToday, presentYesterday)} label="dibanding kemarin" />}
        />
        <StatCard
          icon={UserX} title="Tidak Hadir Hari Ini" tone="amber" value={absentToday}
          chip={<ChangeChip value={change(absentToday, absentYesterday)} label="dibanding kemarin" />}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)]">
        <Panel
          icon={Clock} tone="blue" title="Rata-rata Jam Kerja" subtitle="Rata-rata jam kerja seluruh karyawan, 7 hari terakhir"
          action={<span className="rounded-full bg-gray-100 px-3 py-1 text-[11px] font-medium text-gray-600"><T>7 hari terakhir</T></span>}
        >
          <p className="text-3xl font-bold tabular-nums text-gray-900">
            {weekAverage.toFixed(1)} <span className="text-base font-medium text-gray-400"><T>jam</T></span>
          </p>
          {weekHours.length ? <HoursChart days={week} average={weekAverage} /> : <Empty text="Belum ada data absensi lengkap minggu ini." />}
        </Panel>

        <Panel icon={PieChart} tone="violet" title="Status Karyawan" subtitle="Komposisi karyawan aktif menurut status kerja">
          {active ? <Donut parts={statusParts} /> : <Empty text="Belum ada karyawan aktif." />}
          {expiring > 0 && (
            <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
              {expiring} <T>kontrak berakhir dalam 60 hari</T>
            </p>
          )}
        </Panel>
      </div>

      <Panel
        icon={Users} tone="emerald" title="Karyawan Terbaru" subtitle="Karyawan aktif dengan tanggal masuk terbaru"
        action={
          <Link href="/portal/admin/karyawan" className="inline-flex items-center gap-1 rounded-full bg-brand/10 px-3 py-1 text-xs font-semibold text-brand hover:bg-brand/15">
            <T>Lihat semua</T> <ArrowRight size={13} />
          </Link>
        }
      >
        <div className="-mx-5 -mb-5 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-gray-100 bg-gray-50/70 text-left text-[11px] uppercase tracking-wide text-gray-400">
                <th className="px-5 py-2.5 font-medium"><T>Employee ID</T></th>
                <th className="px-5 py-2.5 font-medium"><T>Nama</T></th>
                <th className="hidden px-5 py-2.5 font-medium md:table-cell"><T>Jabatan</T></th>
                <th className="hidden px-5 py-2.5 font-medium lg:table-cell"><T>Departemen</T></th>
                <th className="px-5 py-2.5 font-medium"><T>Status</T></th>
                <th className="hidden px-5 py-2.5 font-medium sm:table-cell"><T>Tanggal Masuk</T></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {recent.map((e) => (
                <tr key={e.id} className="hover:bg-gray-50/70">
                  <td className="whitespace-nowrap px-5 py-3 font-mono text-xs text-gray-500">{e.employeeId ?? "—"}</td>
                  <td className="px-5 py-3">
                    <Link href={`/portal/admin/karyawan/${e.id}`} className="font-medium text-gray-900 hover:text-brand">{e.name}</Link>
                  </td>
                  <td className="hidden px-5 py-3 text-gray-600 md:table-cell">{e.position ?? "—"}</td>
                  <td className="hidden max-w-64 truncate px-5 py-3 text-gray-600 lg:table-cell">{e.department?.name ?? "—"}</td>
                  <td className="px-5 py-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                      e.employmentStatus === "TETAP" ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-700"
                    }`}>
                      <T>{STATUS_LABEL[e.employmentStatus] ?? e.employmentStatus}</T>
                    </span>
                  </td>
                  <td className="hidden whitespace-nowrap px-5 py-3 text-gray-600 sm:table-cell">{e.joinDate ? formatDate(e.joinDate) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
