// Absen uji (masa testing): mengisi absensi pura-pura untuk semua karyawan aktif, mengikuti shift masing-masing,
// dengan skenario acak (tepat waktu, terlambat, pulang cepat, lupa absen pulang, lembur, alpha).
// Dinyalakan Super Admin di Pengaturan → Fitur; dijalankan cron tiap malam untuk hari kemarin (WIB).
// Semua catatan bertanda "[UJI]" di kolom catatan supaya mudah dikenali dan dihapus sekaligus.
// Skenario lembur juga membuat data lembur yang sudah disetujui (keperluan "[UJI] ...") dari jam akhir shift sampai
// jam bulat setelah absen pulang, sehingga ikut estimasi Kehadiran, Proses Gaji, dan kalender.
import { prisma } from "@/lib/prisma";
import { getShiftCalendars } from "@/lib/schedule";
import { AUTO_ALPHA } from "@/lib/attendance-assess";
import { countSimRequests, deleteSimRequests, simulateRequests } from "@/lib/request-sim";

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
// "HH:MM" ditambah sekian jam (melewati tengah malam kembali ke 00:00).
const addHours = (hhmm: string, hours: number) => {
  const [h, m] = hhmm.split(":").map(Number);
  return `${String((h + hours) % 24).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};
const SIM_OT_NOTE = `${SIM_TAG} Absen simulasi: lembur`;
// Absen uji hari ini yang belum absen pulang karena jam pulangnya belum lewat; diisi ulang saat simulasi berikutnya.
const RUNNING = " (berjalan)";
const OT_ACTIVE = ["PENDING", "APPROVED", "MENUNGGU_KARYAWAN", "DISETUJUI"];
// Lembur uji yang sudah disetujui: mulai jam akhir shift, selesai jam bulat setelah absen pulang (dibayar sampai check-out).
const simOvertime = (userId: string, day: Date, shiftEnd: string, outMin: number) => ({
  userId, date: day, startTime: shiftEnd, endTime: addHours(shiftEnd, Math.max(1, Math.ceil(outMin / 60))),
  reason: `${SIM_TAG} Lembur simulasi`, status: "APPROVED", decidedBy: "Simulasi", decidedAt: new Date(), createdBy: "Simulasi",
});

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
// `now` (hari ini): hanya yang jam check-in-nya sudah lewat yang diisi; check-out kosong bila jam pulangnya belum lewat.
export async function simulateDay(date: Date, now?: number) {
  const day = new Date(`${keyOf(date)}T00:00:00Z`);
  const users = await prisma.user.findMany({
    where: { role: { not: "SUPER_ADMIN" }, isActive: true, OR: [{ joinDate: null }, { joinDate: { lte: day } }] },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  if (!ids.length) return { created: 0, skipped: 0, scenarios: {} as Record<string, number>, overtime: 0 };
  const [cal, existing, leaves, trips] = await Promise.all([
    getShiftCalendars(ids, day, day),
    prisma.attendance.findMany({ where: { userId: { in: ids }, date: day }, select: { id: true, userId: true, note: true, checkIn: true, checkOut: true } }),
    prisma.leaveRequest.findMany({ where: { userId: { in: ids }, status: "APPROVED", startDate: { lte: day }, endDate: { gte: day } }, select: { userId: true } }),
    prisma.businessTrip.findMany({ where: { userId: { in: ids }, status: "APPROVED", startDate: { lte: day }, endDate: { gte: day } }, select: { userId: true } }),
  ]);
  // Alpha otomatis (belum ada absen) boleh diganti absen uji; catatan absen lain tidak disentuh.
  // Absen uji "berjalan" (belum lewat jam pulang saat dibuat) juga diganti dengan isian yang lebih baru.
  const autoAlpha = existing.filter((a) => (a.note === AUTO_ALPHA && !a.checkIn) || (a.note?.endsWith(RUNNING) && !a.checkOut));
  const autoIds = new Set(autoAlpha.map((a) => a.userId));
  const skip = new Set([...existing.filter((a) => !autoIds.has(a.userId)), ...leaves, ...trips].map((x) => x.userId));
  const k = keyOf(day);
  const rows: { userId: string; date: Date; checkIn: Date; checkOut: Date | null; status: "HADIR"; note: string; checkInAddr: string; checkInLocation: string; checkOutLocation: string | null }[] = [];
  const scenarios: Record<string, number> = {};
  const overtimes: ReturnType<typeof simOvertime>[] = [];
  let skipped = 0;
  // Absen uji lembur yang sudah ada tapi belum punya data lembur (dibuat sebelum fitur ini) dilengkapi.
  for (const a of existing.filter((x) => x.note === SIM_OT_NOTE && x.checkOut)) {
    const s = cal[a.userId]?.[k];
    if (!s?.endTime || !a.checkOut) continue;
    const overnight = !!s.startTime && s.endTime <= s.startTime;
    const end = at(overnight ? new Date(day.getTime() + DAY) : day, s.endTime, 0);
    const outMin = Math.round((a.checkOut.getTime() - end.getTime()) / 60_000);
    if (outMin >= 60) overtimes.push(simOvertime(a.userId, day, s.endTime, outMin));
  }
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
    const outMin = sc === "PULANG_CEPAT" ? -(15 + Math.floor(rnd() * 75)) : sc === "LEMBUR" ? 60 + Math.floor(rnd() * 180) : Math.floor(rnd() * 20);
    const checkIn = at(day, s.startTime, inMin);
    if (now !== undefined && checkIn.getTime() > now) { skipped++; continue; } // belum datang
    const planned = sc === "LUPA_PULANG" ? null : at(endDay, s.endTime, outMin);
    const running = !!planned && now !== undefined && planned.getTime() > now; // masih bekerja
    const checkOut = running ? null : planned;
    if (sc === "LEMBUR" && !running) overtimes.push(simOvertime(id, day, s.endTime, outMin));
    rows.push({
      userId: id, date: day, status: "HADIR", note: `${SIM_TAG} Absen simulasi: ${LABEL[sc]}${running ? RUNNING : ""}`,
      checkIn, checkOut,
      checkInAddr: "Simulasi (data uji)", checkInLocation: "Simulasi", checkOutLocation: checkOut ? "Simulasi" : null,
    });
  }
  if (rows.length) {
    const replace = autoAlpha.filter((a) => rows.some((r) => r.userId === a.userId)).map((a) => a.id);
    await prisma.$transaction([
      prisma.attendance.deleteMany({ where: { id: { in: replace } } }),
      prisma.attendance.createMany({ data: rows, skipDuplicates: true }),
    ]);
  }
  // Lembur uji: dilewati bila karyawan sudah punya lembur aktif di tanggal itu.
  if (overtimes.length) {
    const busy = new Set((await prisma.overtime.findMany({
      where: { userId: { in: overtimes.map((o) => o.userId) }, date: day, status: { in: OT_ACTIVE } }, select: { userId: true },
    })).map((o) => o.userId));
    const fresh = overtimes.filter((o) => !busy.has(o.userId));
    if (fresh.length) await prisma.overtime.createMany({ data: fresh });
  }
  return { created: rows.length, skipped, scenarios, overtime: overtimes.length };
}

// Isi absen uji untuk rentang tanggal [from, to] (WIB, paling banyak 31 hari, paling lambat hari ini);
// hari ini diisi sesuai jam sekarang.
export async function simulateRange(from: Date, to: Date) {
  const today = todayWib();
  const end = to > today ? today : to;
  const now = Date.now();
  let created = 0, overtime = 0;
  for (let t = from.getTime(); t <= end.getTime(); t += DAY) {
    const day = new Date(t);
    const r = await simulateDay(day, day.getTime() === today.getTime() ? now : undefined);
    created += r.created; overtime += r.overtime ?? 0;
  }
  return { created, overtime };
}

// Isi absen uji untuk `days` hari terakhir sampai hari ini (WIB); hari ini diisi sesuai jam sekarang.
export async function simulateRecent(days: number) {
  const today = todayWib();
  const now = Date.now();
  let created = 0, overtime = 0;
  for (let i = Math.max(1, Math.min(31, days)) - 1; i >= 0; i--) {
    const r = await simulateDay(new Date(today.getTime() - i * DAY), i === 0 ? now : undefined);
    created += r.created; overtime += r.overtime ?? 0;
  }
  return { created, overtime };
}

// Dipanggil cron tiap malam: kalau fitur menyala, isi absen uji untuk hari kemarin (WIB).
export async function simulateScheduled() {
  if (!(await simEnabled())) return { simulated: false };
  const r = await simulateDay(new Date(todayWib().getTime() - DAY));
  // Pengajuan uji (menunggu persetujuan) untuk tanggal ke depan, supaya alur approval bisa dites.
  const requests = await simulateRequests(4).catch(() => null);
  return { simulated: true, ...r, requests };
}

export async function countSimulated() {
  return prisma.attendance.count({ where: { note: { startsWith: SIM_TAG } } });
}
export { countSimRequests };

// Hapus semua absen uji beserta lembur ujinya dan pengajuan uji.
export async function deleteSimulated() {
  await deleteSimRequests();
  const [r] = await prisma.$transaction([
    prisma.attendance.deleteMany({ where: { note: { startsWith: SIM_TAG } } }),
    prisma.overtime.deleteMany({ where: { reason: { startsWith: SIM_TAG } } }),
  ]);
  return r.count;
}
