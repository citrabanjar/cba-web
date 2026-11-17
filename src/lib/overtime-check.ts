// Cek fisik lembur oleh security (keputusan pemilik 2026-11-17):
// - Security = karyawan aktif yang jadwalnya manual (shift per tanggal di Jadwal Bulanan).
// - Saat karyawan menjawab Bersedia pada SPL, daftar dikirim ke security yang shiftnya beririsan dengan jam lembur
//   (bisa lebih dari satu; daftar dipakai bersama). Tidak ada yang beririsan = tidak ada cek fisik.
// - Security menandai Ada / Tidak ada, boleh berkali-kali; yang sudah Ada keluar dari daftar. Hasil akhir = cek terakhir.
// - Pukul 08:00 WIB esok hari: lembur yang punya absen pulang tetapi cek fisik terakhirnya bukan Ada dilaporkan ke
//   atasan langsung (resume SPL + hasil cek fisik). Atasan memutus Benar lembur / Tidak lembur (tidak dibayar).
//   Selama belum diputus, finalisasi gaji periode itu tertahan.
import { prisma } from "@/lib/prisma";
import { getShiftCalendars } from "@/lib/schedule";
import { atWib, otWindow, shiftWindow } from "@/lib/overtime";
import { notify } from "@/lib/notify";
import { formatDate } from "@/lib/utils";

const DAY = 86_400_000;
const keyOf = (d: Date) => d.toISOString().slice(0, 10);
const clock = (d: Date) => new Date(d.getTime() + 7 * 3600_000).toISOString().slice(11, 16);
export const wibTodayDate = (now = Date.now()) => new Date(`${new Date(now + 7 * 3600_000).toISOString().slice(0, 10)}T00:00:00Z`);

// Karyawan aktif yang jadwal berlakunya (per tanggal) adalah jadwal manual.
export async function securityIds(date: Date) {
  const rows = await prisma.employeeSchedule.findMany({
    where: { effectiveDate: { lte: date }, user: { isActive: true } }, orderBy: { effectiveDate: "asc" }, select: { userId: true, type: true },
  });
  const last = new Map<string, string>();
  for (const r of rows) last.set(r.userId, r.type);
  return [...last].filter(([, t]) => t === "MANUAL").map(([id]) => id);
}
export async function isSecurity(userId: string, date = wibTodayDate()) {
  const s = await prisma.employeeSchedule.findFirst({ where: { userId, effectiveDate: { lte: date } }, orderBy: { effectiveDate: "desc" }, select: { type: true } });
  return s?.type === "MANUAL";
}

// Security yang shiftnya (kemarin, hari itu, atau esok — untuk shift / lembur lewat tengah malam) beririsan dengan jam lembur.
export async function overlappingSecurity(o: { userId: string; date: Date; startTime: string; endTime: string }) {
  const ids = (await securityIds(o.date)).filter((id) => id !== o.userId);
  if (!ids.length) return [];
  const days = [-1, 0, 1].map((d) => new Date(o.date.getTime() + d * DAY));
  const cal = await getShiftCalendars(ids, days[0], days[2]);
  const w = otWindow(o);
  const a = w.start.getTime(), b = w.end.getTime();
  return ids.filter((id) => days.some((d) => {
    const sw = shiftWindow(d, cal[id]?.[keyOf(d)]);
    return !!sw && Math.min(b, sw[1].getTime()) > Math.max(a, sw[0].getTime());
  }));
}

// Dipanggil saat karyawan menjawab Bersedia: tetapkan security pengecek dan kirim notifikasi ke mereka.
export async function assignCheckers(overtimeId: string) {
  const o = await prisma.overtime.findUnique({ where: { id: overtimeId }, include: { user: { select: { name: true } } } });
  if (!o || !o.orderId) return [];
  const ids = await overlappingSecurity(o);
  await prisma.overtime.update({ where: { id: o.id }, data: { checkerIds: ids } });
  if (ids.length) {
    await notify(ids, "Cek fisik lembur", `${o.user.name} · ${formatDate(o.date)} ${o.startTime}–${o.endTime}. Cek keberadaannya saat jam lembur di menu Cek Fisik Lembur.`, "/portal/cek-fisik");
  }
  return ids;
}

// Jendela cek fisik: dari jam mulai lembur sampai 1 jam setelah jam selesai.
export function checkWindow(o: { date: Date; startTime: string; endTime: string }) {
  const w = otWindow(o);
  return { open: w.start.getTime(), close: w.end.getTime() + 3600_000 };
}

export type CheckItem = {
  id: string; name: string; employeeId: string | null; department: string | null; date: string; start: string; end: string; reason: string | null;
  open: boolean; opensAt: string; checks: { name: string; at: string; present: boolean }[];
};
// Daftar cek fisik seorang security: lembur hari ini / kemarin (lewat tengah malam) yang belum ditandai Ada.
export async function checkList(viewerId: string, now = Date.now()): Promise<CheckItem[]> {
  const today = wibTodayDate(now);
  const rows = await prisma.overtime.findMany({
    where: { checkerIds: { has: viewerId }, status: "DISETUJUI", date: { gte: new Date(today.getTime() - DAY), lte: today } },
    include: { user: { select: { name: true, employeeId: true, department: { select: { name: true } } } }, checks: { orderBy: { createdAt: "asc" } } },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  });
  return rows
    .filter((r) => { const w = checkWindow(r); return now <= w.close && !(r.checks.at(-1)?.present); })
    .map((r) => {
      const w = checkWindow(r);
      return {
        id: r.id, name: r.user.name, employeeId: r.user.employeeId, department: r.user.department?.name ?? null, date: keyOf(r.date),
        start: r.startTime, end: r.endTime, reason: r.reason, open: now >= w.open, opensAt: clock(new Date(w.open)),
        checks: r.checks.map((c) => ({ name: c.checkerName, at: clock(c.createdAt), present: c.present })),
      };
    });
}

export async function saveCheck(overtimeId: string, viewer: { id: string; name: string }, present: boolean, now = Date.now()) {
  const o = await prisma.overtime.findUnique({ where: { id: overtimeId }, select: { checkerIds: true, status: true, date: true, startTime: true, endTime: true } });
  if (!o || !o.checkerIds.includes(viewer.id) || o.status !== "DISETUJUI") return { error: "Lembur ini tidak ada di daftar cek fisik Anda." };
  const w = checkWindow(o);
  if (now < w.open) return { error: `Cek fisik baru bisa mulai pukul ${clock(new Date(w.open))}.` };
  if (now > w.close) return { error: "Waktu cek fisik untuk lembur ini sudah lewat." };
  await prisma.overtimeCheck.create({ data: { overtimeId, checkerId: viewer.id, checkerName: viewer.name, present } });
  return {};
}

// ─── Laporan ke atasan (08:00 WIB esok hari) ───────────────────────────────
export async function escalateChecks(now = Date.now()) {
  const today = wibTodayDate(now);
  const after8 = now >= atWib(today, "08:00").getTime();
  const latest = new Date(today.getTime() - (after8 ? 1 : 2) * DAY); // lembur paling baru yang sudah boleh dilaporkan
  const rows = await prisma.overtime.findMany({
    where: { checkerIds: { isEmpty: false }, status: "DISETUJUI", verifyStatus: null, date: { gte: new Date(today.getTime() - 14 * DAY), lte: latest } },
    include: { user: { select: { name: true, managerId: true } }, order: { select: { number: true } }, checks: { orderBy: { createdAt: "asc" } } },
  });
  let n = 0;
  for (const r of rows) {
    const last = r.checks.at(-1);
    if (last?.present) continue;
    const att = await prisma.attendance.findUnique({ where: { userId_date: { userId: r.userId, date: r.date } }, select: { checkIn: true, checkOut: true } });
    if (!att?.checkOut) continue; // tanpa absen pulang lembur tidak dibayar, tidak perlu dilaporkan
    // Ditandai dulu supaya tidak dilaporkan dua kali bila cron dan pemicu halaman berjalan bersamaan.
    const upd = await prisma.overtime.updateMany({ where: { id: r.id, verifyStatus: null }, data: { verifyStatus: "MENUNGGU" } });
    if (!upd.count) continue;
    n++;
    const mgr = r.user.managerId ? await prisma.user.findUnique({ where: { id: r.user.managerId }, select: { id: true, isActive: true } }) : null;
    const to = mgr?.isActive && mgr.id !== r.userId ? [mgr.id]
      : (await prisma.user.findMany({ where: { isActive: true, role: "ADMIN", menuAccess: { has: "spl" } }, select: { id: true } })).map((u) => u.id);
    const cek = last ? `Tidak ada (dicek ${last.checkerName} pukul ${clock(last.createdAt)})` : "tidak pernah dicek security";
    await notify(to, `Konfirmasi lembur ${r.user.name}`,
      `${r.order?.number ?? "SPL"} · ${formatDate(r.date)} ${r.startTime}–${r.endTime}${r.reason ? ` (${r.reason})` : ""}. Absen ${att.checkIn ? clock(att.checkIn) : "—"}–${clock(att.checkOut)}. Cek fisik: ${cek}. Putuskan: benar lembur atau tidak.`,
      "/portal/lembur?tim=1");
  }
  return n;
}

// Keputusan atasan langsung (atau Admin Lembur bila karyawan tanpa atasan aktif).
export async function verifyOvertime(id: string, by: { id: string; name: string; canAdmin: boolean }, benar: boolean, note: string) {
  const o = await prisma.overtime.findUnique({ where: { id }, include: { user: { select: { name: true, manager: { select: { id: true, isActive: true } } } }, order: { select: { number: true, createdBy: true } } } });
  if (!o || o.verifyStatus !== "MENUNGGU") return { error: "Laporan tidak ditemukan atau sudah diputus." };
  const mgr = o.user.manager?.isActive ? o.user.manager.id : null;
  if (!(mgr ? mgr === by.id : by.canAdmin)) return { error: "Keputusan ini oleh atasan langsung karyawan." };
  if (!benar && !note.trim()) return { error: "Tulis alasan bila karyawan tidak lembur." };
  await prisma.overtime.update({
    where: { id },
    data: {
      verifyStatus: benar ? "BENAR" : "TIDAK", verifyBy: by.name, verifyAt: new Date(), verifyNote: note.trim() || null,
      ...(benar ? {} : { status: "DIBATALKAN", note: `Tidak lembur menurut ${by.name}: ${note.trim()}`, decidedBy: by.name, decidedAt: new Date() }),
    },
  });
  const when = `${o.order?.number ?? ""} · ${formatDate(o.date)} ${o.startTime}–${o.endTime}`;
  if (!benar) {
    await notify(o.userId, `Lembur ${o.order?.number ?? ""} dibatalkan`, `${when}. Tidak dibayar: menurut ${by.name} Anda tidak lembur. ${note.trim()}`, "/portal/lembur");
    const creator = o.order?.createdBy ? await prisma.user.findFirst({ where: { name: o.order.createdBy, role: { in: ["ADMIN", "SUPER_ADMIN"] } }, select: { id: true } }) : null;
    if (creator && creator.id !== by.id) await notify(creator.id, `Info: lembur ${o.user.name} dibatalkan`, `${when}. Tidak lembur menurut ${by.name}: ${note.trim()}`, "/portal/admin/lembur");
  }
  return {};
}

// Laporan cek fisik yang belum diputus dalam rentang tanggal (penghalang finalisasi gaji).
export async function pendingVerifications(start?: Date, end?: Date) {
  return prisma.overtime.count({ where: { verifyStatus: "MENUNGGU", ...(start && end ? { date: { gte: start, lte: end } } : {}) } });
}
