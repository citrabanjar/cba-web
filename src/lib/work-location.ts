import { prisma } from "@/lib/prisma";
import type { AllowedLocation } from "@/lib/work-location-client";

export { nearestLocation, type AllowedLocation } from "@/lib/work-location-client";

// Lokasi absen yang boleh dipakai seorang karyawan: gabungan lokasi yang ditempel
// langsung ke karyawan, ke shift, dan ke pola kerja. Kalau tidak ada yang ditempel,
// semua lokasi aktif boleh dipakai.
// Catatan: lokasi per shift dan per pola kerja baru berlaku setelah pola/shift
// ditempel ke karyawan (Schedule tahap berikutnya).
export async function getAllowedLocations(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { workLocations: { where: { isActive: true } } },
  });
  const pick = (l: AllowedLocation) => ({
    id: l.id, name: l.name, latitude: l.latitude, longitude: l.longitude, radius: l.radius,
  });
  const assigned = (user?.workLocations ?? []).map(pick);
  if (assigned.length > 0) return { locations: assigned, assigned: true };

  const all = await prisma.workLocation.findMany({ where: { isActive: true }, orderBy: { name: "asc" } });
  return { locations: all.map(pick), assigned: false };
}

// Tanggal hari ini menurut waktu Jakarta, sebagai tengah malam UTC (format kolom @db.Date).
export function jakartaToday() {
  const now = new Date(Date.now() + 7 * 3600_000);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

// Apakah karyawan sedang Dinas Luar yang sudah disetujui pada tanggal ini.
export async function isOnApprovedTrip(userId: string, day = jakartaToday()) {
  const trip = await prisma.businessTrip.findFirst({
    where: { userId, status: "APPROVED", startDate: { lte: day }, endDate: { gte: day } },
    select: { id: true },
  });
  return !!trip;
}
