"use server";
import { revalidatePath } from "next/cache";
import type { HolidayType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireMenu } from "@/lib/access";

// Hasil dikembalikan sebagai pesan karena pesan error server action disamarkan di production.
type Result = { error?: string };

export type BreakTime = { start: string; end: string };
export type ShiftInput = {
  code: string; name: string; color: string; isOff: boolean;
  startTime: string; endTime: string; breaks: BreakTime[];
  lateTolerance: number; earlyLeaveTolerance: number;
  checkInEarliest: number; checkOutLatest: number;
  overtimeStartAfter: number; overtimeMinimum: number; overtimeRounding: number;
  isActive: boolean;
};
export type PatternInput = {
  name: string; description: string; cycleDays: number; startDate: string; shiftIds: string[];
};
export type RuleInput = {
  overtimeNeedsApproval: boolean; holidayWorkIsOvertime: boolean; halfDayMinutes: number;
  lateAsHalfDayMinutes: number | null; noCheckInIsAlpha: boolean;
};

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const PATH = "/portal/admin/schedule";
const minutes = (n: number, max = 1440) => Number.isFinite(n) && n >= 0 && n <= max;
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

// Istirahat harus berada di dalam jam kerja (memperhitungkan shift lewat tengah malam).
function breaksInside(start: string, end: string, breaks: BreakTime[]) {
  const s = toMin(start);
  const e = toMin(end) <= s ? toMin(end) + 1440 : toMin(end);
  return breaks.every((b) => {
    let bs = toMin(b.start);
    let be = toMin(b.end);
    if (bs < s) { bs += 1440; be += 1440; }
    if (be <= bs) be += 1440;
    return bs >= s && be <= e;
  });
}

export async function saveShift(id: string | null, input: ShiftInput): Promise<Result> {
  await requireMenu("karyawan");
  const code = input.code.trim().toUpperCase();
  const name = input.name.trim();
  if (!code || !name) return { error: "Kode dan nama shift wajib diisi." };
  const breaks = input.isOff ? [] : input.breaks.filter((b) => b.start || b.end);
  if (!input.isOff) {
    if (!TIME.test(input.startTime) || !TIME.test(input.endTime)) return { error: "Jam masuk dan jam pulang wajib diisi (format JJ:MM)." };
    if (input.startTime === input.endTime) return { error: "Jam masuk dan jam pulang tidak boleh sama." };
    if (breaks.some((b) => !TIME.test(b.start) || !TIME.test(b.end) || b.start === b.end)) {
      return { error: "Jam istirahat belum lengkap." };
    }
    if (!breaksInside(input.startTime, input.endTime, breaks)) return { error: "Jam istirahat harus di dalam jam kerja." };
  }
  const nums = [
    input.lateTolerance, input.earlyLeaveTolerance, input.checkInEarliest, input.checkOutLatest,
    input.overtimeStartAfter, input.overtimeMinimum, input.overtimeRounding,
  ];
  if (!nums.every((n) => minutes(n))) return { error: "Isian menit harus angka 0 sampai 1440." };

  const taken = await prisma.workShift.findFirst({
    where: { code: { equals: code, mode: "insensitive" }, ...(id ? { id: { not: id } } : {}) },
    select: { id: true },
  });
  if (taken) return { error: "Kode shift sudah dipakai." };

  const data = {
    code, name, color: input.color || "#10b981", isOff: input.isOff,
    startTime: input.isOff ? null : input.startTime, endTime: input.isOff ? null : input.endTime,
    breaks, lateTolerance: input.lateTolerance, earlyLeaveTolerance: input.earlyLeaveTolerance,
    checkInEarliest: input.checkInEarliest, checkOutLatest: input.checkOutLatest,
    overtimeStartAfter: input.overtimeStartAfter, overtimeMinimum: input.overtimeMinimum,
    overtimeRounding: input.overtimeRounding, isActive: input.isActive,
  };
  if (id) await prisma.workShift.update({ where: { id }, data });
  else await prisma.workShift.create({ data });
  revalidatePath(PATH);
  return {};
}

export async function deleteShift(id: string): Promise<Result> {
  await requireMenu("karyawan");
  const used = await prisma.workPatternDay.count({ where: { shiftId: id } });
  if (used > 0) return { error: "Shift masih dipakai di pola kerja. Nonaktifkan saja, atau ganti dulu di pola kerja." };
  await prisma.workShift.delete({ where: { id } });
  revalidatePath(PATH);
  return {};
}

export async function savePattern(id: string | null, input: PatternInput): Promise<Result> {
  await requireMenu("karyawan");
  const name = input.name.trim();
  if (!name) return { error: "Nama pola kerja wajib diisi." };
  const cycle = Math.trunc(input.cycleDays);
  if (!(cycle >= 1 && cycle <= 62)) return { error: "Panjang siklus 1 sampai 62 hari." };
  if (input.shiftIds.length !== cycle || input.shiftIds.some((s) => !s)) {
    return { error: "Setiap hari di siklus harus punya shift." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate)) return { error: "Tanggal mulai siklus wajib diisi." };
  const shifts = await prisma.workShift.count({ where: { id: { in: [...new Set(input.shiftIds)] } } });
  if (shifts !== new Set(input.shiftIds).size) return { error: "Ada shift yang tidak ditemukan." };

  const taken = await prisma.workPattern.findFirst({
    where: { name: { equals: name, mode: "insensitive" }, ...(id ? { id: { not: id } } : {}) },
    select: { id: true },
  });
  if (taken) return { error: "Nama pola kerja sudah dipakai." };

  const data = {
    name, description: input.description.trim() || null, cycleDays: cycle,
    startDate: new Date(`${input.startDate}T00:00:00Z`),
  };
  const days = input.shiftIds.map((shiftId, dayIndex) => ({ dayIndex, shiftId }));
  if (id) {
    await prisma.$transaction([
      prisma.workPatternDay.deleteMany({ where: { patternId: id } }),
      prisma.workPattern.update({ where: { id }, data: { ...data, days: { create: days } } }),
    ]);
  } else {
    await prisma.workPattern.create({ data: { ...data, days: { create: days } } });
  }
  revalidatePath(PATH);
  return {};
}

export async function deletePattern(id: string): Promise<Result> {
  await requireMenu("karyawan");
  const used = await prisma.employeeSchedule.count({ where: { patternId: id } });
  if (used > 0) return { error: "Pola kerja masih dipakai karyawan. Ganti jadwal karyawannya dulu." };
  await prisma.workPattern.delete({ where: { id } });
  revalidatePath(PATH);
  return {};
}

const HOLIDAY_TYPES: HolidayType[] = ["NASIONAL", "CUTI_BERSAMA", "PERUSAHAAN"];

export async function saveHoliday(
  id: string | null, input: { date: string; name: string; type: string },
): Promise<Result> {
  await requireMenu("karyawan");
  const name = input.name.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !name) return { error: "Tanggal dan nama libur wajib diisi." };
  const type = HOLIDAY_TYPES.includes(input.type as HolidayType) ? (input.type as HolidayType) : "NASIONAL";
  const date = new Date(`${input.date}T00:00:00Z`);
  const taken = await prisma.holiday.findFirst({ where: { date, ...(id ? { id: { not: id } } : {}) }, select: { id: true } });
  if (taken) return { error: "Tanggal ini sudah ada di daftar libur." };
  if (id) await prisma.holiday.update({ where: { id }, data: { date, name, type } });
  else await prisma.holiday.create({ data: { date, name, type } });
  revalidatePath(PATH);
  return {};
}

export async function deleteHoliday(id: string): Promise<Result> {
  await requireMenu("karyawan");
  await prisma.holiday.delete({ where: { id } });
  revalidatePath(PATH);
  return {};
}

export async function saveRule(input: RuleInput): Promise<Result> {
  const user = await requireMenu("karyawan");
  if (!minutes(input.halfDayMinutes)) return { error: "Batas setengah hari harus 0 sampai 1440 menit." };
  if (input.lateAsHalfDayMinutes !== null && !minutes(input.lateAsHalfDayMinutes)) {
    return { error: "Batas terlambat harus 0 sampai 1440 menit." };
  }
  const data = { ...input, updatedBy: user.name };
  await prisma.attendanceRule.upsert({ where: { id: "default" }, update: data, create: { id: "default", ...data } });
  revalidatePath(PATH);
  return {};
}

// ─── Lokasi absen (geotagging) ──────────────────────────────────────────────

export type LocationInput = {
  name: string; address: string; latitude: number; longitude: number; radius: number; isActive: boolean;
  employeeIds: string[]; shiftIds: string[]; patternIds: string[];
};

export async function saveLocation(id: string | null, input: LocationInput): Promise<Result> {
  await requireMenu("karyawan");
  const name = input.name.trim();
  if (!name) return { error: "Nama lokasi wajib diisi." };
  const { latitude, longitude } = input;
  if (!(Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) || (latitude === 0 && longitude === 0)) {
    return { error: "Titik lokasi belum dipilih. Klik peta atau isi koordinat." };
  }
  const radius = Math.round(input.radius);
  if (!(radius >= 10 && radius <= 5000)) return { error: "Radius 10 sampai 5000 meter." };

  const taken = await prisma.workLocation.findFirst({
    where: { name: { equals: name, mode: "insensitive" }, ...(id ? { id: { not: id } } : {}) },
    select: { id: true },
  });
  if (taken) return { error: "Nama lokasi sudah dipakai." };

  const links = (ids: string[]) => [...new Set(ids)].map((v) => ({ id: v }));
  const data = { name, address: input.address.trim() || null, latitude, longitude, radius, isActive: input.isActive };
  if (id) {
    await prisma.workLocation.update({
      where: { id },
      data: {
        ...data,
        employees: { set: links(input.employeeIds) },
        shifts: { set: links(input.shiftIds) },
        patterns: { set: links(input.patternIds) },
      },
    });
  } else {
    await prisma.workLocation.create({
      data: {
        ...data,
        employees: { connect: links(input.employeeIds) },
        shifts: { connect: links(input.shiftIds) },
        patterns: { connect: links(input.patternIds) },
      },
    });
  }
  revalidatePath(PATH);
  return {};
}

export async function deleteLocation(id: string): Promise<Result> {
  await requireMenu("karyawan");
  await prisma.workLocation.delete({ where: { id } });
  revalidatePath(PATH);
  return {};
}

// ─── Jadwal kerja karyawan ──────────────────────────────────────────────────

export type ScheduleInput = { type: "POLA" | "MANUAL"; patternId: string; effectiveDate: string; note: string };

// Tempel jadwal ke satu atau banyak karyawan. Jadwal di tanggal berlaku yang sama diganti.
export async function assignSchedule(userIds: string[], input: ScheduleInput): Promise<Result & { count?: number }> {
  const user = await requireMenu("karyawan");
  const ids = [...new Set(userIds)].filter(Boolean);
  if (ids.length === 0) return { error: "Pilih minimal satu karyawan." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveDate)) return { error: "Tanggal mulai berlaku wajib diisi." };
  if (input.type !== "POLA" && input.type !== "MANUAL") return { error: "Jenis jadwal tidak dikenal." };
  if (input.type === "POLA") {
    const pattern = await prisma.workPattern.findUnique({ where: { id: input.patternId }, select: { id: true } });
    if (!pattern) return { error: "Pilih pola kerja." };
  }
  const effectiveDate = new Date(`${input.effectiveDate}T00:00:00Z`);
  const data = {
    type: input.type,
    patternId: input.type === "POLA" ? input.patternId : null,
    note: input.note.trim() || null,
    createdBy: user.name,
  };
  await prisma.$transaction(ids.map((userId) => prisma.employeeSchedule.upsert({
    where: { userId_effectiveDate: { userId, effectiveDate } },
    update: data,
    create: { userId, effectiveDate, ...data },
  })));
  revalidatePath(PATH);
  revalidatePath("/portal/admin/karyawan", "layout");
  return { count: ids.length };
}

export async function deleteEmployeeSchedule(id: string): Promise<Result> {
  await requireMenu("karyawan");
  await prisma.employeeSchedule.delete({ where: { id } });
  revalidatePath(PATH);
  revalidatePath("/portal/admin/karyawan", "layout");
  return {};
}
