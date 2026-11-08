"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getAllowedLocations, isOnApprovedTrip, nearestLocation } from "@/lib/work-location";

// Cek lokasi absen. Saat Dinas Luar disetujui, absen boleh di mana saja (lokasinya tetap
// disimpan). Selain itu, absen di luar radius semua lokasi yang diizinkan ditolak.
// Selama belum ada lokasi absen sama sekali, absen belum dibatasi.
async function checkLocation(userId: string, lat: number, lng: number) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { error: "Lokasi GPS tidak terbaca. Aktifkan GPS lalu coba lagi." } as const;
  }
  if (await isOnApprovedTrip(userId)) {
    return { label: "Dinas Luar", inside: true, distance: null as number | null } as const;
  }
  const { locations } = await getAllowedLocations(userId);
  if (locations.length === 0) return { label: null, inside: true, distance: null as number | null } as const;
  const nearest = nearestLocation(locations, lat, lng)!;
  const distance = Math.round(nearest.distance);
  if (!nearest.inside) {
    return {
      error: `Anda berada ${distance} m dari lokasi terdekat (${nearest.location.name}, radius ${nearest.location.radius} m). Absen tidak bisa dilakukan.`,
    } as const;
  }
  return { label: nearest.location.name, inside: true, distance } as const;
}

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

  const place = await checkLocation(session.user.id, lat, lng);
  if ("error" in place) return { error: place.error };
  const address = await reverseGeocode(lat, lng);

  await prisma.attendance.upsert({
    where: { userId_date: { userId: session.user.id, date: today } },
    update: {
      checkIn: new Date(),
      checkInLat: lat,
      checkInLng: lng,
      checkInAddr: address,
      checkInLocation: place.label,
      status: "HADIR",
    },
    create: {
      userId: session.user.id,
      date: today,
      checkIn: new Date(),
      checkInLat: lat,
      checkInLng: lng,
      checkInAddr: address,
      checkInLocation: place.label,
      status: "HADIR",
    },
  });

  revalidatePath("/portal/absensi");
  return { ok: true, location: place.label, distance: place.distance, address };
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

  const place = await checkLocation(session.user.id, lat, lng);
  if ("error" in place) return { error: place.error };
  const address = await reverseGeocode(lat, lng);

  await prisma.attendance.update({
    where: { userId_date: { userId: session.user.id, date: today } },
    data: {
      checkOut: new Date(),
      checkOutLat: lat,
      checkOutLng: lng,
      checkOutAddr: address,
      checkOutLocation: place.label,
    },
  });

  revalidatePath("/portal/absensi");
  return { ok: true, location: place.label, distance: place.distance, address };
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
