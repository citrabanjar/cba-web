export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAccess } from "@/lib/access";
import { canEditMenu, hasMenu } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { paidHours, plannedHours, restDaysOf, restKey, splEnabled, syncRevisions } from "@/lib/overtime";
import { orgChart } from "@/lib/spl";
import LemburAdminClient, { type AdminOvertime, type EmployeePick } from "./LemburAdminClient";

export const metadata: Metadata = { title: "Lembur" };
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const hhmm = (d: Date) => new Date(d.getTime() + 7 * 3600_000).toISOString().slice(11, 16);
const thisMonthWib = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 7);

// Panel Admin → Lembur (kewenangan Lembur): buat Surat Perintah Lembur (bila fitur SPL aktif), rekap per bulan.
// Revisi jam lembur ditampilkan; keputusannya oleh Admin Payroll.
export default async function AdminLemburPage({ searchParams }: { searchParams: Promise<{ bulan?: string }> }) {
  const access = await getAccess();
  if (!access) redirect("/portal");
  if (!hasMenu(access, "spl")) redirect("/portal/dashboard");
  // SPL: hak edit Lembur. Keputusan revisi jam lembur: hak edit Gaji & Payroll (diputus di Payroll & Benefit).
  const canSpl = canEditMenu(access, "spl");
  const canRevise = canEditMenu(access, "gaji");
  const { bulan } = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(bulan ?? "") ? bulan! : thisMonthWib();
  const [y, m] = month.split("-").map(Number);
  const from = new Date(Date.UTC(y, m - 1, 1)), to = new Date(Date.UTC(y, m, 0));

  await syncRevisions().catch(() => 0);
  const [spl, org, rows, revisions, employees] = await Promise.all([ 
    splEnabled(),
    orgChart(),
    prisma.overtime.findMany({
      where: { date: { gte: from, lte: to } },
      include: { user: { select: { name: true, employeeId: true } }, order: { select: { number: true } }, checks: { orderBy: { createdAt: "asc" } } },
      orderBy: [{ date: "desc" }, { startTime: "asc" }],
    }),
    prisma.overtime.findMany({
      where: { revisionStatus: "MENUNGGU" },
      include: { user: { select: { name: true, employeeId: true } }, order: { select: { number: true } }, checks: { orderBy: { createdAt: "asc" } } },
      orderBy: { date: "asc" },
    }),
    prisma.user.findMany({
      where: { isActive: true, role: { not: "SUPER_ADMIN" } }, orderBy: { name: "asc" },
      select: { id: true, name: true, employeeId: true, department: { select: { name: true } } },
    }),
  ]);
  const all = [...rows, ...revisions];
  const atts = all.length
    ? await prisma.attendance.findMany({ where: { OR: all.map((r) => ({ userId: r.userId, date: r.date })) }, select: { userId: true, date: true, checkIn: true, checkOut: true } })
    : [];
  const att = new Map(atts.map((a) => [`${a.userId}|${ymd(a.date)}`, a]));
  const restSet = await restDaysOf(all);
  const view = (r: (typeof rows)[number]): AdminOvertime => {
    const a = att.get(`${r.userId}|${ymd(r.date)}`);
    const rest = restSet.has(restKey(r.userId, r.date));
    return {
      id: r.id, name: r.user.name, employeeId: r.user.employeeId, date: ymd(r.date), start: r.startTime, end: r.endTime,
      breakStart: r.breakStart, breakEnd: r.breakEnd, planned: plannedHours(r, rest), rest, spl: r.order?.number ?? null, status: r.status,
      checkOut: a?.checkOut ? new Date(a.checkOut.getTime() + 7 * 3600_000).toISOString().slice(11, 16) : null,
      paid: ["DISETUJUI", "APPROVED"].includes(r.status) && a?.checkOut ? paidHours(r, a, null, rest) : null,
      revisionStatus: r.revisionStatus, revisionEnd: r.revisionEnd, note: r.note, reason: r.reason,
      // Cek fisik security: null = tidak ada security yang beririsan.
      checkInfo: r.checkerIds.length
        ? (r.checks.length ? r.checks.map((c) => `${c.present ? "Ada" : "Tidak ada"} ${hhmm(c.createdAt)} (${c.checkerName})`).join(" · ") : "belum dicek")
        : null,
      verifyStatus: r.verifyStatus,
      // Laporan karyawan tanpa atasan aktif diputus Admin Lembur.
      verifyByAdmin: canSpl && r.verifyStatus === "MENUNGGU" && org.chain(r.userId).length === 0,
    };
  };
  // Admin sendiri dan pimpinan puncak tidak bisa diberi SPL.
  const pickers: EmployeePick[] = employees.filter((e) => e.id !== access.id && !org.isTop(e.id))
    .map((e) => ({ id: e.id, name: e.name, employeeId: e.employeeId, department: e.department?.name ?? null }));

  return <LemburAdminClient canSpl={canSpl} canRevise={canRevise} spl={spl} month={month} rows={rows.map(view)} revisions={revisions.map(view)} employees={pickers} />;
}
