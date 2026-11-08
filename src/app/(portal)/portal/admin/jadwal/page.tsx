export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAccess } from "@/lib/access";
import { hasMenu } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { getShiftCalendars } from "@/lib/schedule";
import { jakartaToday } from "@/lib/work-location";
import JadwalClient from "./JadwalClient";

export const metadata: Metadata = { title: "Jadwal Bulanan" };

// Jadwal shift per tanggal: untuk karyawan Jadwal Manual (Security) dan tukar shift.
export default async function JadwalPage({
  searchParams,
}: {
  searchParams: Promise<{ bulan?: string; semua?: string }>;
}) {
  const access = await getAccess();
  if (!access) redirect("/portal");
  if (!hasMenu(access, "karyawan")) redirect("/portal/dashboard");

  const params = await searchParams;
  const now = jakartaToday();
  const match = /^(\d{4})-(\d{2})$/.exec(params.bulan ?? "");
  const year = match ? Number(match[1]) : now.getUTCFullYear();
  const month = match ? Number(match[2]) - 1 : now.getUTCMonth();
  const showAll = params.semua === "1";

  const monthStart = new Date(Date.UTC(year, month, 1));
  const monthEnd = new Date(Date.UTC(year, month + 1, 0));
  // Seminggu sebelum awal bulan ikut dimuat untuk fitur "isi dari minggu sebelumnya".
  const from = new Date(monthStart.getTime() - 7 * 86_400_000);

  const [employees, shifts] = await Promise.all([
    prisma.user.findMany({
      where: { isActive: true, role: { not: "SUPER_ADMIN" } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, employeeId: true, department: { select: { name: true } } },
    }),
    prisma.workShift.findMany({
      where: { isActive: true },
      orderBy: [{ isOff: "asc" }, { code: "asc" }],
      select: { id: true, code: true, name: true, color: true, isOff: true, startTime: true, endTime: true },
    }),
  ]);
  const calendars = await getShiftCalendars(employees.map((e) => e.id), from, monthEnd);

  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
  const inMonth = (k: string) => k.startsWith(monthKey);
  const rows = employees
    .map((e) => ({
      id: e.id, name: e.name, employeeId: e.employeeId ?? "", department: e.department?.name ?? null,
      days: calendars[e.id] ?? {},
    }))
    .filter((r) => showAll || Object.entries(r.days).some(([k, d]) => inMonth(k) && (d.manual || d.override)));

  return <JadwalClient year={year} month={month} showAll={showAll} rows={rows} shifts={shifts} />;
}
