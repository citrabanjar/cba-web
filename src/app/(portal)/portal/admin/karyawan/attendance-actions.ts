"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/access";
import { assessAttendance } from "@/lib/attendance-assess";

// Ubah absen karyawan oleh SUPER ADMIN (sementara, untuk masa testing; keputusan pemilik 2026-11-11).
// Jam diisi dalam WIB. Jam pulang lebih kecil dari jam masuk = pulang keesokan harinya (shift malam).
// Tanggal di periode gaji bulanan yang sudah FINAL tidak bisa diubah.

type Result = { error?: string };
export type AttendanceEdit = { checkIn: string; checkOut: string; status: string; note: string };
const STATUSES = ["HADIR", "IZIN", "SAKIT", "ALPHA", "CUTI", "DINAS"] as const;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

async function guard(userId: string, date: string) {
  const user = await requireSuperAdmin();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Tanggal tidak valid." } as const;
  const final = await prisma.payrollRun.findFirst({ where: { status: "FINAL", frequency: "BULANAN", period: date.slice(0, 7) }, select: { id: true } });
  if (final) return { error: "Periode gaji bulan ini sudah final, absen tidak bisa diubah." } as const;
  const emp = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!emp) return { error: "Karyawan tidak ditemukan." } as const;
  return { user };
}

function refresh(userId: string) {
  revalidatePath(`/portal/admin/karyawan/${userId}`);
  revalidatePath("/portal/admin/payroll");
  revalidatePath("/portal/profil");
}

export async function saveAttendanceBySuper(userId: string, date: string, input: AttendanceEdit): Promise<Result> {
  const g = await guard(userId, date);
  if ("error" in g) return { error: g.error };
  if (!STATUSES.includes(input.status as (typeof STATUSES)[number])) return { error: "Status tidak dikenal." };
  if ((input.checkIn && !TIME.test(input.checkIn)) || (input.checkOut && !TIME.test(input.checkOut))) return { error: "Jam harus format JJ:MM." };
  if (input.checkOut && !input.checkIn) return { error: "Isi jam masuk dulu." };
  const at = (hhmm: string, nextDay = false) => new Date(new Date(`${date}T${hhmm}:00+07:00`).getTime() + (nextDay ? 86_400_000 : 0));
  const checkIn = input.checkIn ? at(input.checkIn) : null;
  const checkOut = input.checkOut ? at(input.checkOut, input.checkOut <= input.checkIn) : null;
  const stamp = `Diubah Super Admin ${g.user.name ?? ""} (${new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "short", timeStyle: "short" })})`;
  const note = [input.note.trim(), stamp].filter(Boolean).join(" · ");
  const day = new Date(`${date}T00:00:00Z`);
  // Ada jam masuk tapi status masih Alpha (mis. bekas Alpha otomatis) → Hadir.
  const status = (checkIn && input.status === "ALPHA" ? "HADIR" : input.status) as (typeof STATUSES)[number];
  await prisma.attendance.upsert({
    where: { userId_date: { userId, date: day } },
    update: { checkIn, checkOut, status, note },
    create: { userId, date: day, checkIn, checkOut, status, note },
  });
  refresh(userId);
  return {};
}

export async function deleteAttendanceBySuper(userId: string, date: string): Promise<Result> {
  const g = await guard(userId, date);
  if ("error" in g) return { error: g.error };
  const day = new Date(`${date}T00:00:00Z`);
  await prisma.attendance.deleteMany({ where: { userId, date: day } });
  // Hari kerja yang kosong dinilai ulang (bisa jadi Alpha otomatis lagi).
  await assessAttendance(day, day, [userId]);
  refresh(userId);
  return {};
}
