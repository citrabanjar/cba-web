// Absen masuk / pulang dengan lokasi GPS. Dipakai dua pintu dengan aturan yang sama: halaman Absensi di portal
// (lokasi dari browser) dan menu Absensi di Telegram (lokasi dari Live Location, keputusan pemilik 2026-11-21).
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getAllowedLocations, isOnApprovedTrip, nearestLocation } from "@/lib/work-location";
import { checkInBlocked, checkInWarning, checkInWorkDate, checkOutBlocked, checkOutWarning, openAttendance, wibToday } from "@/lib/attendance-assess";
import { unfinishedCheckout } from "@/lib/attendance-fix";

// Cek lokasi absen. Saat Dinas Luar disetujui, absen boleh di mana saja (lokasinya tetap
// disimpan). Selain itu, absen di luar radius semua lokasi yang diizinkan ditolak.
// Karyawan yang tidak ditempel lokasi absen bebas absen di mana saja.
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

export async function clockInFor(userId: string, lat: number, lng: number, confirmed = false) {

  // Tanggal kerja menurut WIB; absen masuk shift malam yang terlambat lewat tengah malam tetap milik shift kemarin.
  const today = await checkInWorkDate(userId);

  const existing = await prisma.attendance.findUnique({
    where: { userId_date: { userId: userId, date: today } },
  });
  if (existing?.checkIn) return { error: "Anda sudah check-in hari ini." };
  // Check-out sebelumnya belum selesai: selesaikan dulu lewat Lupa Absen.
  const unfinished = await unfinishedCheckout(userId, today);
  if (unfinished) return { error: unfinished };
  // Batas jam absen masuk terhadap jam masuk shift (Jadwal → Shift).
  const blockedIn = await checkInBlocked(userId, today);
  if (blockedIn) return { error: blockedIn };

  const place = await checkLocation(userId, lat, lng);
  if ("error" in place) return { error: place.error };
  // Check-in sangat terlambat: karyawan diberi peringatan dulu (cuti setengah hari sebagai alternatif).
  if (!confirmed) { const warn = await checkInWarning(userId, today); if (warn) return { warn }; }
  const address = await reverseGeocode(lat, lng);

  await prisma.attendance.upsert({
    where: { userId_date: { userId: userId, date: today } },
    update: {
      checkIn: new Date(),
      checkInLat: lat,
      checkInLng: lng,
      checkInAddr: address,
      checkInLocation: place.label,
      status: "HADIR",
      note: existing?.note?.startsWith("Otomatis:") ? null : existing?.note,
    },
    create: {
      userId: userId,
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

export async function clockOutFor(userId: string, lat: number, lng: number, confirmed = false) {

  // Absen pulang shift malam (pagi hari berikutnya) masuk ke absen tanggal mulai shift.
  const record = await openAttendance(userId);
  if (!record?.checkIn) {
    // Absen kemarin masih terbuka tapi batas absen pulangnya sudah lewat: sebutkan batasnya.
    const yesterday = new Date(wibToday().getTime() - 86_400_000);
    const y = await prisma.attendance.findUnique({ where: { userId_date: { userId: userId, date: yesterday } }, select: { checkIn: true, checkOut: true } });
    const late = y?.checkIn && !y.checkOut ? await checkOutBlocked(userId, yesterday) : null;
    return { error: late ?? "Check-in belum dilakukan, silakan gunakan menu Pengajuan Absen." };
  }
  if (record.checkOut) return { error: "Anda sudah check-out hari ini." };
  // Batas jam absen pulang terhadap jam pulang shift (Jadwal → Shift).
  const blockedOut = await checkOutBlocked(userId, record.date);
  if (blockedOut) return { error: blockedOut };

  const place = await checkLocation(userId, lat, lng);
  if ("error" in place) return { error: place.error };
  // Check-out jauh lebih awal: karyawan diberi peringatan dulu (cuti setengah hari sebagai alternatif).
  if (!confirmed) { const warn = await checkOutWarning(userId, record.date); if (warn) return { warn }; }
  const address = await reverseGeocode(lat, lng);

  await prisma.attendance.update({
    where: { id: record.id },
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
