export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAccess } from "@/lib/access";
import { hasMenu } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import ScheduleClient from "./ScheduleClient";
import type { BreakTime } from "./actions";

export const metadata: Metadata = { title: "Schedule" };

export default async function SchedulePage() {
  const access = await getAccess();
  if (!access) redirect("/portal");
  if (!hasMenu(access, "karyawan")) redirect("/portal/dashboard");

  const [shifts, patterns, holidays, rule] = await Promise.all([
    prisma.workShift.findMany({ orderBy: [{ isOff: "asc" }, { code: "asc" }], include: { _count: { select: { patternDays: true } } } }),
    prisma.workPattern.findMany({ orderBy: { name: "asc" }, include: { days: { orderBy: { dayIndex: "asc" } } } }),
    prisma.holiday.findMany({ orderBy: { date: "asc" } }),
    prisma.attendanceRule.findUnique({ where: { id: "default" } }),
  ]);

  return (
    <ScheduleClient
      shifts={shifts.map(({ _count, ...s }) => ({ ...s, breaks: (s.breaks as BreakTime[]) ?? [], used: _count.patternDays }))}
      patterns={patterns.map((p) => ({
        id: p.id, name: p.name, description: p.description, cycleDays: p.cycleDays,
        startDate: p.startDate.toISOString().slice(0, 10), shiftIds: p.days.map((d) => d.shiftId),
      }))}
      holidays={holidays.map((h) => ({ id: h.id, date: h.date.toISOString().slice(0, 10), name: h.name, type: h.type }))}
      rule={{
        overtimeNeedsApproval: rule?.overtimeNeedsApproval ?? true,
        holidayWorkIsOvertime: rule?.holidayWorkIsOvertime ?? true,
        halfDayMinutes: rule?.halfDayMinutes ?? 240,
        lateAsHalfDayMinutes: rule?.lateAsHalfDayMinutes ?? null,
        noCheckInIsAlpha: rule?.noCheckInIsAlpha ?? true,
        updatedBy: rule?.updatedBy ?? null,
        updatedAt: rule?.updatedAt ?? null,
      }}
    />
  );
}
