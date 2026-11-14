import type { DayShift } from "@/lib/schedule";

// Terlambat dan pulang cepat per hari, dibandingkan dengan jam shift (aturan CBA):
// - Toleransi shift hanya menentukan status Terlambat (kondite), tidak memotong upah.
// - Terlambat lebih dari 30 menit dipotong, dibulatkan ke bawah per 30 menit dari jam masuk
//   (masuk 08.40 untuk shift 08.00 = 0,5 jam; 09.00 = 1 jam).
// - Pulang cepat: jam pulang dibulatkan ke atas ke kelipatan 30 menit, dihitung sampai jam
//   pulang shift, jam istirahat tidak ikut (pulang 13.25 → 13.30 s/d 16.00 = 2,5 jam).
// workHours = lama shift hari itu dari jam masuk sampai jam pulang, TERMASUK istirahat (pembagi tarif per jam;
// istirahat & libur adalah hak karyawan). Contoh 08.00-16.00 = 8 jam, Sabtu 07.00-12.00 = 5 jam.
export type DayPenalty = { lateMinutes: number; late: boolean; lateHours: number; earlyHours: number; workHours: number };

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};
// Menit sejak 00:00 WIB pada tanggal kerja (bisa lebih dari 1440 untuk shift lewat tengah malam).
const minutesFrom = (at: Date, dateKey: string) => (at.getTime() - Date.parse(`${dateKey}T00:00:00+07:00`)) / 60_000;

export function dayPenalty(day: DayShift | undefined, dateKey: string, checkIn: Date | null, checkOut: Date | null): DayPenalty | null {
  if (!day || day.isOff || !day.startTime || !day.endTime) return null;
  const start = toMin(day.startTime);
  let end = toMin(day.endTime);
  if (end <= start) end += 1440;
  const breaks = (day.breaks ?? []).map((b) => {
    let a = toMin(b.start), z = toMin(b.end);
    if (a < start) { a += 1440; z += 1440; }
    if (z <= a) z += 1440;
    return [a, z] as const;
  });

  const workHours = Math.max(0, end - start) / 60;

  let lateMinutes = 0, lateHours = 0, earlyHours = 0;
  if (checkIn) {
    lateMinutes = Math.max(0, Math.floor(minutesFrom(checkIn, dateKey) - start));
    if (lateMinutes > 30) lateHours = Math.floor(lateMinutes / 30) * 0.5;
  }
  if (checkOut) {
    const out = minutesFrom(checkOut, dateKey);
    if (out < end && end - out > (day.earlyLeaveTolerance ?? 0)) {
      const from = Math.max(start, Math.ceil(out / 30) * 30);
      let minutes = Math.max(0, end - from);
      for (const [a, z] of breaks) minutes -= Math.max(0, Math.min(z, end) - Math.max(a, from));
      earlyHours = Math.max(0, minutes) / 60;
    }
  }
  return { lateMinutes, late: lateMinutes > (day.lateTolerance ?? 0), lateHours, earlyHours, workHours };
}
