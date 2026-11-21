"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getAllowedLocations, isOnApprovedTrip } from "@/lib/work-location";
import { openAttendance, wibToday } from "@/lib/attendance-assess";
import { clockInFor, clockOutFor } from "@/lib/clock";

// Absen yang tampil di kartu "hari ini": shift malam kemarin yang belum pulang, atau absen hari ini (WIB).
export async function getTodayAttendance() {
  const session = await auth();
  if (!session?.user?.id) return null;
  return openAttendance(session.user.id);
}

export async function getWeekAttendance() {
  const session = await auth();
  if (!session?.user?.id) return [];

  const today = wibToday();
  const monday = new Date(today.getTime() - ((today.getUTCDay() + 6) % 7) * 86_400_000);

  return prisma.attendance.findMany({
    where: { userId: session.user.id, date: { gte: monday } },
    orderBy: { date: "asc" },
  });
}

// Absen masuk / pulang: logika di lib/clock (dipakai juga menu Absensi di Telegram).
export async function checkIn(lat: number, lng: number, confirmed = false) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Sesi tidak valid, silakan login ulang." };
  return clockInFor(session.user.id, lat, lng, confirmed);
}

export async function checkOut(lat: number, lng: number, confirmed = false) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Sesi tidak valid, silakan login ulang." };
  return clockOutFor(session.user.id, lat, lng, confirmed);
}

// Lokasi yang ditampilkan di peta absensi karyawan.
export async function getMyLocations() {
  const session = await auth();
  if (!session?.user?.id) return { locations: [], onTrip: false };
  const [{ locations }, onTrip] = await Promise.all([
    getAllowedLocations(session.user.id),
    isOnApprovedTrip(session.user.id),
  ]);
  return { locations, onTrip };
}
