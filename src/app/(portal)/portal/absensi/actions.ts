"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getDistanceMeters } from "@/lib/utils";
import { revalidatePath } from "next/cache";

const OFFICE_LAT = parseFloat(process.env.NEXT_PUBLIC_OFFICE_LAT ?? "-3.3186");
const OFFICE_LNG = parseFloat(process.env.NEXT_PUBLIC_OFFICE_LNG ?? "114.5944");
const OFFICE_RADIUS = parseFloat(process.env.NEXT_PUBLIC_OFFICE_RADIUS_METERS ?? "200");

async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      { headers: { "User-Agent": "CBA-Portal/1.0" }, next: { revalidate: 0 } }
    );
    const data = await res.json();
    return data.display_name ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  } catch {
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }
}

export async function getTodayAttendance() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return prisma.attendance.findUnique({
    where: { userId_date: { userId: session.user.id, date: today } },
  });
}

export async function getWeekAttendance() {
  const session = await auth();
  if (!session?.user?.id) return [];

  const monday = new Date();
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  monday.setHours(0, 0, 0, 0);

  return prisma.attendance.findMany({
    where: { userId: session.user.id, date: { gte: monday } },
    orderBy: { date: "asc" },
  });
}

export async function checkIn(lat: number, lng: number) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Sesi tidak valid, silakan login ulang." };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const existing = await prisma.attendance.findUnique({
    where: { userId_date: { userId: session.user.id, date: today } },
  });
  if (existing?.checkIn) return { error: "Anda sudah check-in hari ini." };

  const distance = getDistanceMeters(lat, lng, OFFICE_LAT, OFFICE_LNG);
  const inRadius = distance <= OFFICE_RADIUS;
  const address = await reverseGeocode(lat, lng);

  await prisma.attendance.upsert({
    where: { userId_date: { userId: session.user.id, date: today } },
    update: {
      checkIn: new Date(),
      checkInLat: lat,
      checkInLng: lng,
      checkInAddr: address,
      status: inRadius ? "HADIR" : "HADIR",
    },
    create: {
      userId: session.user.id,
      date: today,
      checkIn: new Date(),
      checkInLat: lat,
      checkInLng: lng,
      checkInAddr: address,
      status: "HADIR",
    },
  });

  revalidatePath("/portal/absensi");
  return {
    ok: true,
    inRadius,
    distance: Math.round(distance),
    address,
  };
}

export async function checkOut(lat: number, lng: number) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Sesi tidak valid, silakan login ulang." };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const record = await prisma.attendance.findUnique({
    where: { userId_date: { userId: session.user.id, date: today } },
  });
  if (!record?.checkIn) return { error: "Anda belum check-in hari ini." };
  if (record.checkOut) return { error: "Anda sudah check-out hari ini." };

  const address = await reverseGeocode(lat, lng);

  await prisma.attendance.update({
    where: { userId_date: { userId: session.user.id, date: today } },
    data: {
      checkOut: new Date(),
      checkOutLat: lat,
      checkOutLng: lng,
      checkOutAddr: address,
    },
  });

  revalidatePath("/portal/absensi");
  return { ok: true, address };
}
