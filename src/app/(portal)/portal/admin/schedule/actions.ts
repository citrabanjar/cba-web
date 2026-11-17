"use server";
import { revalidatePath } from "next/cache";
import type { HolidayType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireMenu, requireMenuApply } from "@/lib/access";
import { holdForApproval } from "@/lib/approval-hold";
import { holdDiff } from "@/lib/hold-diff";

// Hasil dikembalikan sebagai pesan karena pesan error server action disamarkan di production.
// proposed = perubahan parameter ditahan untuk approval (aturan Peran Admin): berisi nama approver.
// Menempel jadwal ke karyawan (operasional) tidak ditahan.
type Result = { error?: string; proposed?: string };
const SHIFT_LABELS: Record<string, string> = {
  code: "Kode", name: "Nama", isOff: "Hari libur", startTime: "Jam masuk", endTime: "Jam pulang", breaks: "Istirahat",
  lateTolerance: "Toleransi terlambat (menit)", earlyLeaveTolerance: "Toleransi pulang cepat (menit)", checkInEarliest: "Absen masuk dibuka sebelum jam masuk (menit)",
  checkOutLatest: "Absen pulang ditutup setelah jam pulang (menit)", overtimeStartAfter: "Lembur mulai setelah (menit)", overtimeMinimum: "Minimal lembur (menit)",
  overtimeRounding: "Pembulatan lembur (menit)", isActive: "Aktif",
};

export type BreakTime = { start: string; end: string };
export type ShiftInput = {
  code: string; name: string; color: string; isOff: boolean;
  startTime: string; endTime: string; breaks: BreakTime[];
  lateTolerance: number; earlyLeaveTolerance: number;
  checkInEarliest: number | null; checkOutLatest: number | null; // batas jam absen (menit; null = tanpa batas)
  overtimeStartAfter: number; overtimeMinimum: number; overtimeRounding: number;
  isActive: boolean;
};
export type PatternInput = {
  name: string; description: string; cycleDays: number; startDate: string; shiftIds: string[];
};
export type RuleInput = {
  overtimeNeedsApproval: boolean; holidayWorkIsOvertime: boolean; halfDayMinutes: number;
  lateAsHalfDayMinutes: number | null; noCheckInIsAlpha: boolean;
  // Batas jam absen terhadap shift (menit; null = tanpa batas).
  checkInOpenMinutes: number | null; checkInCloseMinutes: number | null; checkOutCloseMinutes: number | null;
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
  await requireMenu("absensi");
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
    input.lateTolerance, input.earlyLeaveTolerance,
    input.overtimeStartAfter, input.overtimeMinimum, input.overtimeRounding,
    ...[input.checkInEarliest, input.checkOutLatest].filter((n): n is number => n !== null),
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
    checkInEarliest: input.isOff ? null : input.checkInEarliest, checkOutLatest: input.isOff ? null : input.checkOutLatest,
    overtimeStartAfter: input.overtimeStartAfter, overtimeMinimum: input.overtimeMinimum,
    overtimeRounding: input.overtimeRounding, isActive: input.isActive,
  };
  const before = id ? await prisma.workShift.findUnique({ where: { id } }) : null;
  const held = await holdForApproval({
    kind: "absensi.saveShift", args: [id, input], title: `Absensi: ${id ? "ubah" : "tambah"} shift ${code} - ${name}`,
    details: holdDiff(SHIFT_LABELS, before as Record<string, unknown> | null, data as Record<string, unknown>),
  });
  if (held) return held;
  if (id) await prisma.workShift.update({ where: { id }, data });
  else {
    // Shift baru ditaruh paling akhir.
    const last = await prisma.workShift.aggregate({ _max: { sortOrder: true } });
    await prisma.workShift.create({ data: { ...data, sortOrder: (last._max.sortOrder ?? 0) + 1 } });
  }
  revalidatePath(PATH);
  return {};
}

// Simpan urutan kartu shift hasil digeser (drag & drop). ids = urutan baru dari atas.
export async function reorderShifts(ids: string[]): Promise<Result> {
  await requireMenu("absensi");
  const unique = [...new Set(ids)];
  if (unique.length === 0 || unique.length > 200) return { error: "Urutan tidak valid." };
  const found = await prisma.workShift.count({ where: { id: { in: unique } } });
  if (found !== unique.length) return { error: "Ada shift yang tidak ditemukan." };
  await prisma.$transaction(unique.map((id, i) => prisma.workShift.update({ where: { id }, data: { sortOrder: i + 1 } })));
  revalidatePath(PATH);
  return {};
}

export async function deleteShift(id: string): Promise<Result> {
  await requireMenu("absensi");
  const used = await prisma.workPatternDay.count({ where: { shiftId: id } });
  if (used > 0) return { error: "Shift masih dipakai di pola kerja. Nonaktifkan saja, atau ganti dulu di pola kerja." };
  const scheduled = await prisma.employeeShiftDay.count({ where: { shiftId: id } });
  if (scheduled > 0) return { error: "Shift masih dipakai di Jadwal Bulanan. Nonaktifkan saja supaya riwayat jadwal tetap utuh." };
  const sh = await prisma.workShift.findUnique({ where: { id }, select: { code: true, name: true } });
  const held = await holdForApproval({
    kind: "absensi.deleteShift", args: [id], title: `Absensi: hapus shift ${sh?.code ?? ""} - ${sh?.name ?? ""}`,
    details: [{ field: "Shift", oldValue: `${sh?.code ?? ""} - ${sh?.name ?? ""}`, newValue: "(dihapus)" }],
  });
  if (held) return held;
  await prisma.workShift.delete({ where: { id } });
  revalidatePath(PATH);
  return {};
}

export async function savePattern(id: string | null, input: PatternInput): Promise<Result> {
  await requireMenu("absensi");
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
  const [old, codes] = await Promise.all([
    id ? prisma.workPattern.findUnique({ where: { id }, include: { days: { orderBy: { dayIndex: "asc" }, select: { shift: { select: { code: true } } } } } }) : null,
    prisma.workShift.findMany({ where: { id: { in: input.shiftIds } }, select: { id: true, code: true } }),
  ]);
  const codeOf = new Map(codes.map((c) => [c.id, c.code]));
  const held = await holdForApproval({
    kind: "absensi.savePattern", args: [id, input], title: `Absensi: ${id ? "ubah" : "tambah"} pola kerja ${name}`,
    details: holdDiff({ name: "Nama", description: "Keterangan", cycleDays: "Panjang siklus (hari)", startDate: "Mulai siklus", shifts: "Urutan shift" },
      old ? { ...old, shifts: old.days.map((d) => d.shift.code).join(", ") } : null,
      { ...data, shifts: input.shiftIds.map((s) => codeOf.get(s) ?? "?").join(", ") }),
  });
  if (held) return held;
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
  await requireMenu("absensi");
  const used = await prisma.employeeSchedule.count({ where: { patternId: id } });
  if (used > 0) return { error: "Pola kerja masih dipakai karyawan. Ganti jadwal karyawannya dulu." };
  const pt = await prisma.workPattern.findUnique({ where: { id }, select: { name: true } });
  const held = await holdForApproval({
    kind: "absensi.deletePattern", args: [id], title: `Absensi: hapus pola kerja ${pt?.name ?? ""}`,
    details: [{ field: "Pola kerja", oldValue: pt?.name ?? null, newValue: "(dihapus)" }],
  });
  if (held) return held;
  await prisma.workPattern.delete({ where: { id } });
  revalidatePath(PATH);
  return {};
}

const HOLIDAY_TYPES: HolidayType[] = ["NASIONAL", "CUTI_BERSAMA", "PERUSAHAAN"];

export async function saveHoliday(
  id: string | null, input: { date: string; name: string; type: string },
): Promise<Result> {
  await requireMenu("absensi");
  const name = input.name.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !name) return { error: "Tanggal dan nama libur wajib diisi." };
  const type = HOLIDAY_TYPES.includes(input.type as HolidayType) ? (input.type as HolidayType) : "NASIONAL";
  const date = new Date(`${input.date}T00:00:00Z`);
  const taken = await prisma.holiday.findFirst({ where: { date, ...(id ? { id: { not: id } } : {}) }, select: { id: true } });
  if (taken) return { error: "Tanggal ini sudah ada di daftar libur." };
  const oldH = id ? await prisma.holiday.findUnique({ where: { id } }) : null;
  const held = await holdForApproval({
    kind: "absensi.saveHoliday", args: [id, input], title: `Absensi: ${id ? "ubah" : "tambah"} hari libur ${input.date} - ${name}`,
    details: holdDiff({ date: "Tanggal", name: "Nama", type: "Jenis" }, oldH as Record<string, unknown> | null, { date, name, type }),
  });
  if (held) return held;
  if (id) await prisma.holiday.update({ where: { id }, data: { date, name, type } });
  else await prisma.holiday.create({ data: { date, name, type } });
  revalidatePath(PATH);
  return {};
}

export async function deleteHoliday(id: string): Promise<Result> {
  await requireMenu("absensi");
  const h = await prisma.holiday.findUnique({ where: { id }, select: { date: true, name: true } });
  const label = h ? `${h.date.toISOString().slice(0, 10)} - ${h.name}` : "";
  const held = await holdForApproval({
    kind: "absensi.deleteHoliday", args: [id], title: `Absensi: hapus hari libur ${label}`,
    details: [{ field: "Hari libur", oldValue: label || null, newValue: "(dihapus)" }],
  });
  if (held) return held;
  await prisma.holiday.delete({ where: { id } });
  revalidatePath(PATH);
  return {};
}

export async function saveRule(input: RuleInput): Promise<Result> {
  const user = await requireMenu("absensi");
  if (!minutes(input.halfDayMinutes)) return { error: "Batas setengah hari harus 0 sampai 1440 menit." };
  if (input.lateAsHalfDayMinutes !== null && !minutes(input.lateAsHalfDayMinutes)) {
    return { error: "Batas terlambat harus 0 sampai 1440 menit." };
  }
  for (const v of [input.checkInOpenMinutes, input.checkInCloseMinutes, input.checkOutCloseMinutes]) {
    if (v !== null && !minutes(v)) return { error: "Batas jam absen harus 0 sampai 1440 menit." };
  }
  const data = { ...input, updatedBy: user.name };
  const oldRule = await prisma.attendanceRule.findUnique({ where: { id: "default" } });
  const held = await holdForApproval({
    kind: "absensi.saveRule", args: [input], title: "Absensi: ubah aturan kehadiran",
    details: holdDiff({
      overtimeNeedsApproval: "Lembur perlu persetujuan", holidayWorkIsOvertime: "Kerja di hari libur = lembur", halfDayMinutes: "Batas setengah hari (menit)",
      lateAsHalfDayMinutes: "Terlambat dihitung setengah hari (menit)", noCheckInIsAlpha: "Tanpa check-in = alpha",
      checkInOpenMinutes: "Absen masuk dibuka sebelum jam masuk (menit)", checkInCloseMinutes: "Absen masuk ditutup setelah jam masuk (menit)",
      checkOutCloseMinutes: "Absen pulang ditutup setelah jam pulang (menit)",
    }, oldRule as Record<string, unknown> | null, input as unknown as Record<string, unknown>),
  });
  if (held) return held;
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
  await requireMenu("absensi");
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
  const oldLoc = id ? await prisma.workLocation.findUnique({ where: { id }, include: { _count: { select: { employees: true, shifts: true, patterns: true } } } }) : null;
  const held = await holdForApproval({
    kind: "absensi.saveLocation", args: [id, input], title: `Absensi: ${id ? "ubah" : "tambah"} lokasi absen ${name}`,
    details: holdDiff(
      { name: "Nama lokasi", address: "Alamat", latitude: "Latitude", longitude: "Longitude", radius: "Radius (meter)", isActive: "Aktif", employees: "Khusus karyawan", shifts: "Khusus shift", patterns: "Khusus pola kerja" },
      oldLoc ? { ...oldLoc, employees: oldLoc._count.employees, shifts: oldLoc._count.shifts, patterns: oldLoc._count.patterns } : null,
      { ...data, employees: new Set(input.employeeIds).size, shifts: new Set(input.shiftIds).size, patterns: new Set(input.patternIds).size },
    ),
  });
  if (held) return held;
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
  await requireMenu("absensi");
  const loc = await prisma.workLocation.findUnique({ where: { id }, select: { name: true } });
  const held = await holdForApproval({
    kind: "absensi.deleteLocation", args: [id], title: `Absensi: hapus lokasi absen ${loc?.name ?? ""}`,
    details: [{ field: "Lokasi absen", oldValue: loc?.name ?? null, newValue: "(dihapus)" }],
  });
  if (held) return held;
  await prisma.workLocation.delete({ where: { id } });
  revalidatePath(PATH);
  return {};
}

// ─── Jadwal kerja karyawan ──────────────────────────────────────────────────

export type ScheduleInput = { type: "POLA" | "MANUAL"; patternId: string; effectiveDate: string; note: string };

// Tempel jadwal ke satu atau banyak karyawan. Jadwal di tanggal berlaku yang sama diganti.
export async function assignSchedule(userIds: string[], input: ScheduleInput): Promise<Result & { count?: number }> {
  const user = await requireMenuApply("absensi");
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

// Hapus jadwal karyawan. Jadwal Manual: semua isian shift per tanggal sejak tanggal berlakunya (sampai jadwal
// berikutnya) ikut dihapus, termasuk tanggal yang sudah ada absennya (keputusan pemilik 2026-11-16).
export async function deleteEmployeeSchedule(id: string): Promise<Result & { removed?: number }> {
  await requireMenuApply("absensi");
  const sc = await prisma.employeeSchedule.findUnique({ where: { id } });
  if (!sc) return { error: "Jadwal tidak ditemukan." };
  let removed = 0;
  if (sc.type === "MANUAL") {
    const next = await prisma.employeeSchedule.findFirst({
      where: { userId: sc.userId, effectiveDate: { gt: sc.effectiveDate } }, orderBy: { effectiveDate: "asc" }, select: { effectiveDate: true },
    });
    const range = { gte: sc.effectiveDate, ...(next ? { lt: next.effectiveDate } : {}) };
    removed = (await prisma.employeeShiftDay.deleteMany({ where: { userId: sc.userId, date: range } })).count;
  }
  await prisma.employeeSchedule.delete({ where: { id } });
  revalidatePath(PATH);
  revalidatePath("/portal/admin/karyawan", "layout");
  return { removed };
}

// ─── Jadwal bulanan (shift per tanggal) ─────────────────────────────────────

export type ShiftDayChange = { userId: string; date: string; shiftId: string | null };

// Simpan isian Jadwal Bulanan. shiftId null berarti isian tanggal itu dihapus
// (kembali mengikuti pola kerja, atau "?" untuk jadwal manual).
export async function saveShiftDays(changes: ShiftDayChange[]): Promise<Result & { count?: number; marked?: number }> {
  const user = await requireMenuApply("absensi");
  const valid = changes.filter((c) => c.userId && /^\d{4}-\d{2}-\d{2}$/.test(c.date));
  if (valid.length === 0) return { error: "Tidak ada perubahan untuk disimpan." };
  if (valid.length > 5000) return { error: "Perubahan terlalu banyak sekaligus. Simpan per bulan." };
  const shiftIds = [...new Set(valid.map((c) => c.shiftId).filter(Boolean) as string[])];
  const found = await prisma.workShift.count({ where: { id: { in: shiftIds } } });
  if (found !== shiftIds.length) return { error: "Ada shift yang tidak ditemukan." };

  await prisma.$transaction(valid.map((c) => {
    const date = new Date(`${c.date}T00:00:00Z`);
    return c.shiftId
      ? prisma.employeeShiftDay.upsert({
          where: { userId_date: { userId: c.userId, date } },
          update: { shiftId: c.shiftId, updatedBy: user.name },
          create: { userId: c.userId, date, shiftId: c.shiftId, updatedBy: user.name },
        })
      : prisma.employeeShiftDay.deleteMany({ where: { userId: c.userId, date } });
  }));

  // Karyawan yang belum punya jadwal sama sekali sampai tanggal pertama yang diisi otomatis
  // ditandai Jadwal Manual mulai tanggal itu, supaya hari lain tampil "?" (belum diisi).
  const firstByUser = new Map<string, string>();
  for (const c of valid) {
    if (!c.shiftId) continue;
    const f = firstByUser.get(c.userId);
    if (!f || c.date < f) firstByUser.set(c.userId, c.date);
  }
  let marked = 0;
  for (const [userId, first] of firstByUser) {
    const effectiveDate = new Date(`${first}T00:00:00Z`);
    const has = await prisma.employeeSchedule.findFirst({ where: { userId, effectiveDate: { lte: effectiveDate } }, select: { id: true } });
    if (has) continue;
    await prisma.employeeSchedule.create({
      data: { userId, type: "MANUAL", effectiveDate, note: "Otomatis dari Jadwal Bulanan", createdBy: user.name },
    });
    marked += 1;
  }

  revalidatePath("/portal/admin/schedule");
  revalidatePath("/portal/admin/karyawan", "layout");
  return { count: valid.length, marked };
}
