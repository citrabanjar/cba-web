export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { T } from "@/components/i18n";
import { isSuperAdmin } from "@/lib/roles";
import { wibToday } from "@/lib/attendance-assess";
import { FIX_LIVE, hmWib } from "@/lib/attendance-fix";
import LupaAbsenForm from "./LupaAbsenForm";

export const metadata: Metadata = { title: "Lupa Absen" };
const ymd = (d: Date) => d.toISOString().slice(0, 10);

// Lupa Absen (karyawan): ajukan jam check-in / check-out yang terlewat; diputus atasan langsung atau Workflow.
export default async function LupaAbsenPage({ searchParams }: { searchParams: Promise<{ tanggal?: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/portal");
  if (isSuperAdmin(session.user.role)) redirect("/portal/dashboard");
  const id = session.user.id;
  const today = wibToday();
  const since = new Date(today.getTime() - 31 * 86_400_000);
  const [fixes, atts] = await Promise.all([
    prisma.attendanceCorrection.findMany({ where: { userId: id }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.attendance.findMany({
      where: { userId: id, date: { gte: since, lte: today } },
      orderBy: { date: "desc" }, select: { date: true, checkIn: true, checkOut: true, status: true },
    }),
  ]);
  // Absen tidak lengkap 31 hari terakhir (lupa check-in atau check-out, selain hari ini) sebagai pilihan cepat.
  const incomplete = atts.filter((a) => a.date < today && !!a.checkIn !== !!a.checkOut);
  const covered = new Set(fixes.filter((f) => FIX_LIVE.includes(f.status)).map((f) => ymd(f.date)));
  const { tanggal } = await searchParams;

  return (
    <div className="min-h-full bg-gray-50">
      <div className="border-b border-gray-100 bg-white px-6 py-4">
        <h2 className="font-bold text-gray-800"><T>Lupa Absen</T></h2>
        <p className="mt-0.5 text-xs text-gray-400">{session.user.name}</p>
      </div>
      <LupaAbsenForm
        today={ymd(today)} initialDate={tanggal && /^\d{4}-\d{2}-\d{2}$/.test(tanggal) ? tanggal : ""}
        incomplete={incomplete.filter((a) => !covered.has(ymd(a.date))).map((a) => ymd(a.date))}
        records={Object.fromEntries(atts.map((a) => [ymd(a.date), { checkIn: hmWib(a.checkIn), checkOut: hmWib(a.checkOut) }]))}
        fixes={fixes.map((f) => ({
          id: f.id, date: ymd(f.date), checkIn: hmWib(f.checkIn), checkOut: hmWib(f.checkOut), reason: f.reason, status: f.status,
          decidedBy: f.decidedBy, note: f.note,
        }))}
      />
    </div>
  );
}
