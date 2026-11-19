export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { T } from "@/components/i18n";
import { isSuperAdmin } from "@/lib/roles";
import { wibToday } from "@/lib/attendance-assess";
import { FIX_LIVE, hmWib } from "@/lib/attendance-fix";
import { hasBalance, visibleBalances } from "@/lib/leave-balance";
import LupaAbsenForm from "./LupaAbsenForm";

export const metadata: Metadata = { title: "Pengajuan Absen" };
const ymd = (d: Date) => d.toISOString().slice(0, 10);

// Pengajuan Absen (karyawan): Lupa Absen (jam check-in / check-out terlewat; diputus atasan langsung atau Workflow Lupa Absen),
// atau tidak masuk hari ini / tanggal lewat sebagai Potong Cuti Tahunan / Izin Tanpa Hak Cuti (penyetuju cuti).
// Halaman hanya memuat pengajuan yang masih diproses agar ringan di HP.
export default async function LupaAbsenPage({ searchParams }: { searchParams: Promise<{ tanggal?: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/portal");
  if (isSuperAdmin(session.user.role)) redirect("/portal/dashboard");
  const id = session.user.id;
  const today = wibToday();
  const since = new Date(today.getTime() - 31 * 86_400_000);
  const [fixes, atts, leaves, balances, annualPolicies] = await Promise.all([
    prisma.attendanceCorrection.findMany({ where: { userId: id, status: "PENDING" }, orderBy: { createdAt: "desc" } }),
    prisma.attendance.findMany({
      where: { userId: id, date: { gte: since, lte: today } },
      orderBy: { date: "desc" }, select: { date: true, checkIn: true, checkOut: true, status: true },
    }),
    prisma.leaveRequest.findMany({ where: { userId: id, status: "PENDING", urgent: true }, orderBy: { startDate: "desc" }, include: { policy: { select: { name: true } } } }),
    visibleBalances([id]),
    prisma.leavePolicy.findMany({ where: { isActive: true, category: "TAHUNAN" }, orderBy: { sortOrder: "asc" } }),
  ]);
  const annualPolicy = annualPolicies.find((p) => hasBalance(p));
  const annualRow = annualPolicy ? balances.find((b) => b.policyId === annualPolicy.id) : undefined;
  // Absen tidak lengkap 31 hari terakhir (lupa check-in atau check-out, selain hari ini) sebagai pilihan cepat.
  const incomplete = atts.filter((a) => a.date < today && !!a.checkIn !== !!a.checkOut);
  const covered = new Set((await prisma.attendanceCorrection.findMany({ where: { userId: id, status: { in: FIX_LIVE }, date: { gte: since } }, select: { date: true } })).map((f) => ymd(f.date)));
  const { tanggal } = await searchParams;

  return (
    <div className="min-h-full bg-gray-50">
      <div className="border-b border-gray-100 bg-white px-6 py-4">
        <h2 className="font-bold text-gray-800"><T>Pengajuan Absen</T></h2>
        <p className="mt-0.5 text-xs text-gray-400">{session.user.name}</p>
      </div>
      <LupaAbsenForm
        today={ymd(today)} initialDate={tanggal && /^\d{4}-\d{2}-\d{2}$/.test(tanggal) ? tanggal : ""}
        incomplete={incomplete.filter((a) => !covered.has(ymd(a.date))).map((a) => ymd(a.date))}
        records={Object.fromEntries(atts.map((a) => [ymd(a.date), { checkIn: hmWib(a.checkIn), checkOut: hmWib(a.checkOut) }]))}
        fixes={fixes.map((f) => ({ id: f.id, date: ymd(f.date), checkIn: hmWib(f.checkIn), checkOut: hmWib(f.checkOut), reason: f.reason }))}
        leaves={leaves.map((l) => ({ id: l.id, start: ymd(l.startDate), end: ymd(l.endDate), days: l.totalDays, name: l.policy?.name ?? l.type, reason: l.reason }))}
        annual={annualRow && !annualRow.problem ? { available: Math.max(0, annualRow.balance - annualRow.pending) } : null}
      />
    </div>
  );
}
