import { getDistanceMeters } from "@/lib/utils";

// Bagian geotagging yang aman dipakai di browser (tanpa database).
export type AllowedLocation = { id: string; name: string; latitude: number; longitude: number; radius: number };

// Lokasi terdekat dari posisi karyawan (dihitung dari tepi radius), beserta apakah
// posisinya di dalam radius lokasi itu.
export function nearestLocation(locations: AllowedLocation[], lat: number, lng: number) {
  let best: { location: AllowedLocation; distance: number } | null = null;
  for (const location of locations) {
    const distance = getDistanceMeters(lat, lng, location.latitude, location.longitude);
    if (!best || distance - location.radius < best.distance - best.location.radius) best = { location, distance };
  }
  return best ? { ...best, inside: best.distance <= best.location.radius } : null;
}
