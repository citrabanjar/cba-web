// Pengajuan uji (masa testing, bagian dari Absen Uji): membuat beberapa pengajuan karyawan berstatus menunggu
// lewat jalur yang sama dengan pengajuan dari menu (lib/request-submit.ts) — Cuti Tahunan, Sakit, Izin/cuti khusus,
// Dinas Luar, Pinjaman, Tukar Shift, dan pengajuan Lembur (bila SPL tidak dipakai). Approval tidak disimulasikan:
// pengajuan masuk ke penyetuju asli (atasan langsung / Workflow) untuk dites manual. Tanggal selalu ke depan
// (besok dan seterusnya). Semua keterangan diawali "[UJI]" dan ikut terhapus bersama absen uji.
import { prisma } from "@/lib/prisma";
import { getShiftCalendars } from "@/lib/schedule";
import { splEnabled } from "@/lib/overtime";
import { createLeave, requestLoanFor, submitOvertimeFor, submitSwapFor, submitTripFor } from "@/lib/request-submit";

export const SIM_TAG = "[UJI]";
const DAY = 86_400_000;
const keyOf = (d: Date) => d.toISOString().slice(0, 10);
const todayWib = () => new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date())}T00:00:00Z`);

function seeded(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
}

type Kind = "CUTI_TAHUNAN" | "SAKIT" | "IZIN" | "DINAS" | "PINJAMAN" | "TUKAR_SHIFT" | "LEMBUR";
export const REQ_LABEL: Record<Kind, string> = {
  CUTI_TAHUNAN: "cuti tahunan", SAKIT: "sakit", IZIN: "izin / cuti khusus", DINAS: "dinas luar", PINJAMAN: "pinjaman", TUKAR_SHIFT: "tukar shift", LEMBUR: "lembur",
};
const WEIGHTS: [Kind, number][] = [["CUTI_TAHUNAN", 22], ["SAKIT", 15], ["IZIN", 10], ["DINAS", 15], ["PINJAMAN", 10], ["TUKAR_SHIFT", 10], ["LEMBUR", 18]];
const PLACES = ["Banjarbaru", "Martapura", "Tanjung", "Kotabaru", "Batulicin", "Palangkaraya", "Balikpapan"];
const REASONS: Record<Kind, string[]> = {
  CUTI_TAHUNAN: ["acara keluarga", "pulang kampung", "urusan pribadi"],
  SAKIT: ["demam, ada surat dokter", "kontrol ke dokter", "rawat jalan"],
  IZIN: ["keperluan keluarga", "urusan penting"],
  DINAS: ["survei lokasi proyek", "pengiriman material", "rapat dengan klien"],
  PINJAMAN: ["biaya sekolah anak", "renovasi rumah", "biaya berobat keluarga"],
  TUKAR_SHIFT: ["ada keperluan keluarga", "jadwal kontrol dokter"],
  LEMBUR: ["menyelesaikan fabrikasi", "bongkar muat material", "perbaikan mesin"],
};

// Buat sekitar `count` pengajuan uji. Hasil: jumlah per jenis yang berhasil dibuat.
export async function simulateRequests(count = 4, seedKey = keyOf(todayWib())) {
  const rnd = seeded(`req|${seedKey}|${Date.now()}`);
  const pickOf = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
  const today = todayWib();
  const users = await prisma.user.findMany({
    where: { role: { not: "SUPER_ADMIN" }, isActive: true, OR: [{ joinDate: null }, { joinDate: { lte: today } }] },
    select: { id: true, name: true },
  });
  if (users.length < 2) return { created: {} as Record<string, number>, total: 0 };
  const [spl, policies] = await Promise.all([
    splEnabled(),
    prisma.leavePolicy.findMany({ where: { isActive: true }, select: { id: true, category: true, noticeDays: true } }),
  ]);
  // Hari kerja ke depan (14 hari) tiap karyawan, untuk memilih tanggal yang punya shift.
  const horizon = Array.from({ length: 14 }, (_, i) => new Date(today.getTime() + (i + 1) * DAY));
  const cal = await getShiftCalendars(users.map((u) => u.id), horizon[0], horizon[horizon.length - 1]);
  const workDays = (id: string, from = 0) => horizon.filter((d, i) => i >= from && (() => { const s = cal[id]?.[keyOf(d)]; return !!s && !s.isOff && !s.holiday && !s.manual && !!s.startTime; })());

  const kinds = WEIGHTS.filter(([k]) => !(k === "LEMBUR" && spl));
  const totalW = kinds.reduce((a, [, w]) => a + w, 0);
  const pickKind = (): Kind => { let r = rnd() * totalW; for (const [k, w] of kinds) { if ((r -= w) < 0) return k; } return kinds[0][0]; };

  const created: Record<string, number> = {};
  let made = 0;
  for (let attempt = 0; attempt < count * 6 && made < count; attempt++) {
    const kind = pickKind();
    const u = pickOf(users);
    const who = { id: u.id, name: u.name };
    const reason = `${SIM_TAG} ${pickOf(REASONS[kind])}`;
    let ok = false;
    try {
      if (kind === "CUTI_TAHUNAN" || kind === "SAKIT" || kind === "IZIN") {
        const cat = kind === "CUTI_TAHUNAN" ? ["TAHUNAN"] : kind === "SAKIT" ? ["SAKIT"] : ["KHUSUS", "IBADAH", "TANPA_UPAH"];
        const pol = pickOf(policies.filter((p) => cat.includes(p.category)));
        if (!pol) continue;
        const days = workDays(u.id, Math.max(0, pol.noticeDays - 1));
        if (!days.length) continue;
        const start = pickOf(days.slice(0, 7));
        const end = kind === "SAKIT" && rnd() < 0.4 ? days.find((d) => d > start) ?? start : start;
        const delegate = kind === "CUTI_TAHUNAN" ? pickOf(users.filter((x) => x.id !== u.id)).id : "";
        const r = await createLeave(u.id, { policyId: pol.id, startDate: keyOf(start), endDate: keyOf(end), reason, dayPart: "PENUH", delegateId: delegate });
        ok = !("error" in r && r.error);
      } else if (kind === "DINAS") {
        const days = workDays(u.id);
        if (!days.length) continue;
        const start = pickOf(days.slice(0, 7));
        const end = new Date(start.getTime() + Math.floor(rnd() * 3) * DAY);
        const r = await submitTripFor(who, { destination: pickOf(PLACES), purpose: reason, startDate: keyOf(start), endDate: keyOf(end) });
        ok = !("error" in r && r.error);
      } else if (kind === "PINJAMAN") {
        const next = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1)).toISOString().slice(0, 7);
        const r = await requestLoanFor(who, { amount: (1 + Math.floor(rnd() * 5)) * 1_000_000, tenor: 3 + Math.floor(rnd() * 10), startPeriod: next, purpose: reason });
        ok = !r.error;
      } else if (kind === "TUKAR_SHIFT") {
        const days = workDays(u.id);
        if (!days.length) continue;
        const date = pickOf(days.slice(0, 10));
        const mine = cal[u.id]?.[keyOf(date)]?.code;
        const partner = users.find((x) => x.id !== u.id && (() => { const s = cal[x.id]?.[keyOf(date)]; return !!s && !s.manual && s.code !== mine; })());
        if (!partner) continue;
        const r = await submitSwapFor(who, { date: keyOf(date), partnerId: partner.id, reason });
        ok = !r.error;
      } else if (kind === "LEMBUR") {
        const days = workDays(u.id);
        if (!days.length) continue;
        const date = pickOf(days.slice(0, 7));
        const s = cal[u.id]?.[keyOf(date)];
        if (!s?.endTime) continue;
        const [h, m] = s.endTime.split(":").map(Number);
        const end = `${String((h + 2 + Math.floor(rnd() * 2)) % 24).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
        const r = await submitOvertimeFor(who, { date: keyOf(date), startTime: s.endTime, endTime: end, reason });
        ok = !r.error;
      }
    } catch {
      ok = false;
    }
    if (ok) { made++; created[REQ_LABEL[kind]] = (created[REQ_LABEL[kind]] ?? 0) + 1; }
  }
  return { created, total: made };
}

// Pengajuan uji yang tersimpan (semua status).
export async function countSimRequests() {
  const tag = { startsWith: SIM_TAG };
  const [a, b, c, d, e] = await Promise.all([
    prisma.leaveRequest.count({ where: { reason: tag } }),
    prisma.businessTrip.count({ where: { purpose: tag } }),
    prisma.employeeLoan.count({ where: { purpose: tag } }),
    prisma.shiftSwapRequest.count({ where: { reason: tag } }),
    prisma.overtime.count({ where: { reason: tag, status: { in: ["PENDING", "REJECTED", "CANCELLED"] } } }),
  ]);
  return a + b + c + d + e;
}

// Hapus semua pengajuan uji. Pinjaman uji yang sempat disetujui ikut terhapus beserta angsurannya.
export async function deleteSimRequests() {
  const tag = { startsWith: SIM_TAG };
  const loans = await prisma.employeeLoan.findMany({ where: { purpose: tag }, select: { id: true } });
  // Tukar shift uji yang sempat disetujui: kembalikan Jadwal Bulanan kedua karyawan di tanggal itu.
  const swaps = await prisma.shiftSwapRequest.findMany({ where: { reason: tag, status: "DISETUJUI" }, select: { requesterId: true, partnerId: true, date: true } });
  const revert = swaps.flatMap((s) => [s.requesterId, s.partnerId].map((userId) => ({ userId, date: s.date, note: { startsWith: "Tukar shift dengan" } })));
  const r = await prisma.$transaction([
    ...(revert.length ? [prisma.employeeShiftDay.deleteMany({ where: { OR: revert } })] : []),
    prisma.leaveRequest.deleteMany({ where: { reason: tag } }),
    prisma.businessTrip.deleteMany({ where: { purpose: tag } }),
    prisma.employeeLoan.deleteMany({ where: { id: { in: loans.map((l) => l.id) } } }),
    prisma.shiftSwapRequest.deleteMany({ where: { reason: tag } }),
  ]);
  return r.slice(revert.length ? 1 : 0).reduce((a, x) => a + x.count, 0);
}
