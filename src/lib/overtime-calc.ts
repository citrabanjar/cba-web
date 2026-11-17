// Hitungan jam lembur tanpa database (dipakai server dan form SPL di layar), SOP form SPL lama
// (keputusan pemilik 2026-11-17):
// - Istirahat hari kerja 18:00–19:00. Hari libur (shift OFF, hari libur, atau Minggu tanpa jadwal) 12:00–13:00 dan 18:00–19:00.
// - Istirahat dipotong hanya bila rentangnya TERCAKUP PENUH oleh jam lembur.
// - Jam efektif = lama lembur − istirahat yang dipotong.

export const OT_BREAKS_WORK = [["18:00", "19:00"]] as const;
export const OT_BREAKS_REST = [["12:00", "13:00"], ["18:00", "19:00"]] as const;
export const otBreaks = (rest: boolean) => (rest ? OT_BREAKS_REST : OT_BREAKS_WORK);
export const otBreakText = (rest: boolean) => (rest ? "12:00–13:00 dan 18:00–19:00" : "18:00–19:00");
export const OT_BREAK_RULE = "Istirahat dipotong bila tercakup penuh: hari kerja 18:00–19:00; hari libur 12:00–13:00 dan 18:00–19:00.";

export const toMin = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return (h || 0) * 60 + (m || 0); };

// Jam lembur terjadwal: jam efektif dan istirahat yang dipotong. Jam akhir ≤ jam mulai = lewat tengah malam.
export function otPlan(startTime: string, endTime: string, rest: boolean) {
  const s = toMin(startTime);
  let e = toMin(endTime);
  if (e <= s) e += 1440;
  const cut: string[] = [];
  let minutes = e - s;
  for (const off of [0, 1440]) {
    for (const [a, b] of otBreaks(rest)) {
      const a0 = toMin(a) + off, b0 = toMin(b) + off;
      if (a0 >= s && b0 <= e) { minutes -= b0 - a0; cut.push(`${a}–${b}`); }
    }
  }
  return { hours: Math.round((Math.max(0, minutes) / 60) * 100) / 100, breaks: cut, overnight: toMin(endTime) <= s };
}
