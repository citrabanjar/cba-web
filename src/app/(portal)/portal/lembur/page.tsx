export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { T } from "@/components/i18n";
import { isSuperAdmin } from "@/lib/roles";
import { paidHours, plannedHours, splEnabled } from "@/lib/overtime";
import LemburClient, { type MyOvertime } from "./LemburClient";

export const metadata: Metadata = { title: "Lembur" };
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

// Lembur karyawan: menjawab SPL (bila fitur SPL aktif) atau mengajukan lembur sendiri.
export default async function LemburPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/portal");
  if (isSuperAdmin(session.user.role)) redirect("/portal/dashboard");
  const userId = session.user.id;
  const since = daysAgo(90);
  const [spl, rows] = await Promise.all([
    splEnabled(),
    prisma.overtime.findMany({
      where: { userId, OR: [{ date: { gte: since } }, { status: { in: ["MENUNGGU_KARYAWAN", "PENDING"] } }] },
      include: { order: { select: { number: true } } }, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 100,
    }),
  ]);
  const atts = rows.length
    ? await prisma.attendance.findMany({ where: { userId, date: { in: rows.map((r) => r.date) } }, select: { date: true, checkIn: true, checkOut: true } })
    : [];
  const att = new Map(atts.map((a) => [ymd(a.date), a]));
  const items: MyOvertime[] = rows.map((r) => ({
    id: r.id, date: ymd(r.date), start: r.startTime, end: r.endTime, breakStart: r.breakStart, breakEnd: r.breakEnd,
    planned: plannedHours(r), paid: ["DISETUJUI", "APPROVED"].includes(r.status) && att.get(ymd(r.date))?.checkOut ? paidHours(r, att.get(ymd(r.date))) : null,
    status: r.status, spl: r.order?.number ?? null, reason: r.reason, note: r.note, decidedBy: r.decidedBy,
    revisionStatus: r.revisionStatus, revisionEnd: r.revisionEnd,
  }));

  return (
    <div className="min-h-full bg-gray-50">
      <div className="border-b border-gray-100 bg-white px-6 py-4">
        <h2 className="font-bold text-gray-800"><T>Lembur</T></h2>
        <p className="text-xs text-gray-400">{session.user.name}</p>
      </div>
      <LemburClient spl={spl} items={items} />
    </div>
  );
}
