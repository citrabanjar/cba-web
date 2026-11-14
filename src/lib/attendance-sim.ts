// Absen uji (masa testing): mengisi absensi pura-pura untuk semua karyawan aktif, mengikuti shift masing-masing,
// dengan skenario acak (tepat waktu, terlambat, pulang cepat, lupa absen pulang, lembur, alpha).
// Dinyalakan Super Admin di Pengaturan → Fitur; dijalankan cron tiap malam untuk hari kemarin (WIB).
// Semua catatan bertanda "[UJI]" di kolom catatan supaya mudah dikenali dan dihapus sekaligus.
import { prisma } from "@/lib/prisma";
import { getShiftCalendars } from "@/lib/schedule";
import { AUTO_ALPHA } from "@/lib/attendance-assess";

export const SIM_SETTING_KEY = "attendance-sim";
export const SIM_TAG = "[UJI]";

const DAY = 86_400_000;
const keyOf = (d: Date) => d.toISOString().slice(0, 10);

export async function simEnabled() {
  const row = await prisma.appSetting.findUnique({ where: { key: SIM_SETTING_KEY } });
  return (row?.value as { enabled?: boolean } | null)?.enabled === true;
}

// Hari ini menurut WIB, sebagai tanggal UTC tengah malam.
export function todayWib() {
  const text = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
  return new Date(`${text}T00:00:00Z`);
}

// Angka acak tetap per karyawan + tanggal (diulang hasilnya sama).
function seeded(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
}

// Jam "HH:MM" (WIB) pada tanggal itu → waktu UTC, plus geser menit.
const at = (date: Date, hhmm: string, plusMin: number) => {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(date.getTime() + ((h - 7) * 60 + m + plusMin) * 60_000);
};

type Scenario = "NORMAL" | "TERLAMBAT" | "PULANG_CEPAT" | "LUPA_PULANG" | "LEMBUR" | "ALPHA";
const LABEL: Record<Scenario, string> = {
  NORMAL: "tepat waktu", TERLAMBAT: "terlambat", PULANG_CEPAT: "pulang cepat", LUPA_PULANG: "lupa absen pulang", LEMBUR: "lembur", ALPHA: "alpha",
};
function pick(r: number): Scenario {
  if (r < 0.66) return "NORMAL";
  if (r < 0.76) return "TERLAMBAT";
  if (r < 0.82) return "PULANG_CEPAT";
  if (r < 0.88) return "LUPA_PULANG";
  if (r < 0.95) return "LEMBUR";
  return "ALPHA";
}

// Isi absen uji untuk satu tanggal. Karyawan yang sudah punya catatan absen, sedang cuti/dinas disetujui,
// libur, atau belum ada shift (jadwal manual "?") dilewati. Alpha: tidak diisi (dinilai otomatis oleh sistem).
export async function simulateDay(date: Date) {
  const day = new Date(`${keyOf(date)}T00:00:00Z`);
  const users = await prisma.user.findMany({
    where: { role: { not: "SUPER_ADMIN" }, isActive: true, OR: [{ joinDate: null }, { joinDate: { lte: day } }] },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  if (!ids.length) return { created: 0, skipped: 0, scenarios: {} as Record<string, number> };
  const [cal, existing, leaves, trips] = await Promise.all([
    getShiftCalendars(ids, day, day),
    prisma.attendance.findMany({ where: { userId: { in: ids }, date: day }, select: { id: true, userId: true, note: true, checkIn: true } }),
    prisma.leaveRequest.findMany({ where: { userId: { in: ids }, status: "APPROVED", startDate: { lte: day }, endDate: { gte: day } }, select: { userId: true } }),
    prisma.businessTrip.findMany({ where: { userId: { in: ids }, status: "APPROVED", startDate: { lte: day }, endDate: { gte: day } }, select: { userId: true } }),
  ]);
  // Alpha otomatis (belum ada absen) boleh diganti absen uji; catatan absen lain tidak disentuh.
  const autoAlpha = existing.filter((a) => a.note === AUTO_ALPHA && !a.checkIn);
  const autoIds = new Set(autoAlpha.map((a) => a.userId));
  const skip = new Set([...existing.filter((a) => !autoIds.has(a.userId)), ...leaves, ...trips].map((x) => x.userId));
  const k = keyOf(day);
  const rows: { userId: string; date: Date; checkIn: Date; checkOut: Date | null; status: "HADIR"; note: string; checkInAddr: string; checkInLocation: string; checkOutLocation: string | null }[] = [];
  const scenarios: Record<string, number> = {};
  let skipped = 0;
  for (const id of ids) {
    const s = cal[id]?.[k];
    if (skip.has(id) || !s || s.isOff || s.holiday || s.manual || !s.startTime || !s.endTime) { skipped++; continue; }
    const rnd = seeded(`${id}|${k}`);
    const sc = pick(rnd());
    scenarios[LABEL[sc]] = (scenarios[LABEL[sc]] ?? 0) + 1;
    if (sc === "ALPHA") continue;
    const overnight = s.endTime <= s.startTime;
    const endDay = overnight ? new Date(day.getTime() + DAY) : day;
    const inMin = sc === "TERLAMBAT" ? 10 + Math.floor(rnd() * 50) : -Math.floor(rnd() * 15);
    const outMin = sc === "PULANG_CEPAT" ? -(15 + Math.floor(rnd() * 75)) : sc === "LEMBUR" ? 90 + Math.floor(rnd() * 90) : Math.floor(rnd() * 20);
    rows.push({
      userId: id, date: day, status: "HADIR", note: `${SIM_TAG} Absen simulasi: ${LABEL[sc]}`,
      checkIn: at(day, s.startTime, inMin), checkOut: sc === "LUPA_PULANG" ? null : at(endDay, s.endTime, outMin),
      checkInAddr: "Simulasi (data uji)", checkInLocation: "Simulasi", checkOutLocation: sc === "LUPA_PULANG" ? null : "Simulasi",
    });
  }
  if (rows.length) {
    const replace = autoAlpha.filter((a) => rows.some((r) => r.userId === a.userId)).map((a) => a.id);
    await prisma.$transaction([
      prisma.attendance.deleteMany({ where: { id: { in: replace } } }),
      prisma.attendance.createMany({ data: rows, skipDuplicates: true }),
    ]);
  }
  return { created: rows.length, skipped, scenarios };
}

// Isi absen uji untuk beberapa hari terakhir (sampai kemarin, WIB).
export async function simulateRecent(days: number) {
  const today = todayWib();
  let created = 0;
  for (let i = Math.max(1, Math.min(31, days)); i >= 1; i--) created += (await simulateDay(new Date(today.getTime() - i * DAY))).created;
  return { created };
}

// Dipanggil cron tiap malam: kalau fitur menyala, isi absen uji untuk hari kemarin (WIB).
export async function simulateScheduled() {
  if (!(await simEnabled())) return { simulated: false };
  const r = await simulateDay(new Date(todayWib().getTime() - DAY));
  return { simulated: true, ...r };
}

export async function countSimulated() {
  return prisma.attendance.count({ where: { note: { startsWith: SIM_TAG } } });
}

export async function deleteSimulated() {
  const r = await prisma.attendance.deleteMany({ where: { note: { startsWith: SIM_TAG } } });
  return r.count;
}
