export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Timer } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { T } from "@/components/i18n";
import { isSuperAdmin } from "@/lib/roles";
import { getShiftCalendar } from "@/lib/schedule";
import { paidHours } from "@/lib/overtime";
import { estimateOvertime } from "@/lib/payroll-run";
import { formatDate, formatRupiah } from "@/lib/utils";
import AttendanceCalendar from "../admin/karyawan/[id]/AttendanceCalendar";

export const metadata: Metadata = { title: "Kehadiran" };

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const todayWib = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const num = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");
const calendarRange = () => {
  const now = new Date();
  return [new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), 1)), new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 3, 0))] as const;
};

// Kehadiran karyawan (tombol HP): kalender kehadiran + estimasi upah lembur periode gaji berjalan.
export default async function KehadiranPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/portal");
  if (isSuperAdmin(session.user.role)) redirect("/portal/dashboard");
  const id = session.user.id;
  const [from, to] = calendarRange();

  const [user, shiftDays, overtimes, est] = await Promise.all([
    prisma.user.findUnique({
      where: { id },
      select: {
        attendances: { orderBy: { date: "desc" }, take: 400, select: { id: true, date: true, checkIn: true, checkOut: true, checkInAddr: true, status: true, note: true } },
        leaves: { orderBy: { startDate: "desc" }, take: 50, select: { id: true, type: true, startDate: true, endDate: true, totalDays: true, reason: true, status: true, delegateName: true } },
        businessTrips: { orderBy: { startDate: "desc" }, take: 50, select: { id: true, destination: true, startDate: true, endDate: true, status: true } },
      },
    }),
    getShiftCalendar(id, from, to),
    prisma.overtime.findMany({
      where: { userId: id, date: { gte: from, lte: to }, status: { in: ["DISETUJUI", "APPROVED", "MENUNGGU_KARYAWAN", "PENDING"] } },
      include: { order: { select: { number: true } } }, orderBy: { date: "asc" },
    }),
    estimateOvertime(id, todayWib()).catch(() => null),
  ]);
  if (!user) redirect("/portal");

  // Rincian lembur di periode gaji berjalan: jam dibayar (per 1 jam penuh, sampai absen pulang).
  const inPeriod = est ? overtimes.filter((o) => ymd(o.date) >= est.start && ymd(o.date) <= est.end) : [];
  const atts = inPeriod.length
    ? await prisma.attendance.findMany({ where: { userId: id, date: { in: inPeriod.map((o) => o.date) } }, select: { date: true, checkIn: true, checkOut: true } })
    : [];
  const att = new Map(atts.map((a) => [ymd(a.date), a]));
  const rows = inPeriod.map((o) => {
    const ok = ["DISETUJUI", "APPROVED"].includes(o.status);
    const a = att.get(ymd(o.date));
    return {
      id: o.id, date: o.date, time: `${o.startTime}–${o.endTime}`, spl: o.order?.number ?? null,
      state: !ok ? "Menunggu" : !a?.checkOut ? "Belum absen pulang" : `${paidHours(o, a)} jam dibayar`,
      revision: o.revisionStatus === "MENUNGGU",
    };
  });

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold text-white"><T>Kehadiran</T></h1>
        <p className="text-sm text-white/70"><T>Kalender kehadiran dan estimasi upah lembur periode gaji berjalan.</T></p>
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-bold text-gray-800"><Timer size={18} className="text-brand" /> <T>Estimasi Lembur</T></h2>
          {est && <span className="text-xs text-gray-500">{est.label} · {formatDate(est.start)} – {formatDate(est.end)}</span>}
        </div>
        {!est ? (
          <p className="text-sm text-gray-400"><T>Estimasi belum bisa dihitung.</T></p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Stat label="Jam lembur hari kerja" value={`${num(est.hoursWork)} jam`} />
              <Stat label="Jam lembur hari libur" value={`${num(est.hoursRest)} jam`} />
              <Stat label="Estimasi diterima" value={formatRupiah(est.total)} strong />
            </div>
            {est.items.length > 0 ? (
              <div className="mt-4 divide-y divide-gray-100 rounded-xl border border-gray-100">
                {est.items.map((i) => (
                  <div key={i.name} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
                    <div><p className="font-medium text-gray-800">{i.name}</p><p className="text-xs text-gray-400">{i.detail}</p></div>
                    <p className="shrink-0 font-semibold text-gray-800">{formatRupiah(i.amount)}</p>
                  </div>
                ))}
              </div>
            ) : (est.hoursWork + est.hoursRest > 0) && (
              <p className="mt-3 text-xs text-gray-400"><T>Komponen upah lembur belum ditempel ke Anda; hubungi HRD.</T></p>
            )}

            {rows.length > 0 && (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs text-gray-400"><th className="py-1 pr-3 font-medium"><T>Tanggal</T></th><th className="py-1 pr-3 font-medium"><T>Jam</T></th><th className="py-1 font-medium"><T>Keterangan</T></th></tr></thead>
                  <tbody className="divide-y divide-gray-100">
                    {rows.map((r) => (
                      <tr key={r.id}>
                        <td className="py-1.5 pr-3 text-gray-800">{formatDate(r.date)}</td>
                        <td className="py-1.5 pr-3 text-gray-800">{r.time}{r.spl && <span className="ml-1 text-xs text-gray-400">{r.spl}</span>}</td>
                        <td className="py-1.5 text-gray-600"><T>{r.state}</T>{r.revision && <span className="ml-1 text-xs text-amber-600">· <T>revisi jam menunggu Admin</T></span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-3 text-[11px] text-gray-400">
              <T>Estimasi sampai hari ini: hanya lembur yang disetujui dan sudah absen pulang, dibayar per 1 jam penuh. Angka final mengikuti Proses Gaji oleh HRD.</T>{" "}
              <Link href="/portal/lembur" className="font-semibold text-brand"><T>Menu Lembur →</T></Link>
            </p>
          </>
        )}
      </section>

      <AttendanceCalendar
        attendances={user.attendances} leaves={user.leaves} trips={user.businessTrips} shiftDays={shiftDays}
        overtimes={overtimes.map((o) => ({ date: ymd(o.date), start: o.startTime, end: o.endTime, status: o.status }))}
      />
    </div>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${strong ? "border-brand/30 bg-brand/5" : "border-gray-100 bg-gray-50"}`}>
      <p className="text-[11px] text-gray-500"><T>{label}</T></p>
      <p className={`mt-0.5 font-bold ${strong ? "text-brand" : "text-gray-800"}`}>{value}</p>
    </div>
  );
}
