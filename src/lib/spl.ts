// Surat Perintah Lembur (SPL) — aturan dari SOP form SPL lama (keputusan pemilik 2026-11-17):
// - Satu SPL = satu tanggal, banyak karyawan; tiap karyawan punya jam mulai, jam selesai, dan uraian pekerjaan (wajib).
// - Ditolak: Admin untuk dirinya sendiri, pimpinan puncak, karyawan dobel dalam satu SPL, karyawan yang sudah punya
//   lembur di tanggal itu, karyawan yang sedang dinas, dan jam lembur yang masuk jam shift. Tanpa batas jam selesai /
//   jumlah karyawan (Pengaturan SPL dihapus, keputusan pemilik 2026-11-17).
// - Info: atasan langsung mendapat info (tanpa estimasi); atasan di atasnya sampai pimpinan puncak mendapat info,
//   estimasi upah lembur (rumus komponen payroll), dan bisa membatalkan lembur karyawan di bawahnya.
import { prisma } from "@/lib/prisma";
import { getShiftCalendars } from "@/lib/schedule";
import { dinasOn, isRestDay, isTime, OT_ACTIVE, otBreakText, otOverlap, otPlan, restDaysOf, restKey, shiftConflicts } from "@/lib/overtime";
import { notify } from "@/lib/notify";
import { formatDate } from "@/lib/utils";
import { estimateOvertimeCost } from "@/lib/payroll-run";

const keyOf = (d: Date) => d.toISOString().slice(0, 10);

// ─── Bagan organisasi (atasan aktif) ────────────────────────────────────────
export async function orgChart() {
  const users = await prisma.user.findMany({ where: { isActive: true, role: { not: "SUPER_ADMIN" } }, select: { id: true, name: true, employeeId: true, managerId: true } });
  const byId = new Map(users.map((u) => [u.id, u]));
  const mgr = (id: string) => { const m = byId.get(id)?.managerId; return m && m !== id && byId.has(m) ? m : null; };
  // Rantai atasan dari atasan langsung sampai pimpinan puncak.
  const chain = (id: string) => {
    const out: string[] = []; const seen = new Set([id]);
    for (let c = mgr(id); c && !seen.has(c) && out.length < 20; c = mgr(c)) { out.push(c); seen.add(c); }
    return out;
  };
  const hasReports = new Set(users.map((u) => u.managerId).filter((x): x is string => !!x));
  // Pimpinan puncak: tanpa atasan aktif dan punya bawahan.
  const isTop = (id: string) => !mgr(id) && hasReports.has(id);
  return { users, byId, chain, isTop };
}

// ─── Pemeriksaan baris SPL ──────────────────────────────────────────────────
export type SplRowInput = { userId: string; startTime: string; endTime: string; reason: string };
export type SplRowCheck = SplRowInput & {
  name: string; employeeId: string | null; rest: boolean; hours: number; breaks: string[]; estimate: number | null; problem: string | null;
};

// final = saat dikirim (uraian wajib); saat pratinjau uraian kosong belum ditandai.
export async function checkSpl(adminId: string, dateStr: string, rows: SplRowInput[], final: boolean) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return { error: "Tanggal lembur wajib diisi.", rows: [] as SplRowCheck[] };
  const date = new Date(`${dateStr}T00:00:00Z`);
  const org = await orgChart();
  const ids = rows.map((r) => r.userId);
  const [cal, dinas, busy] = await Promise.all([
    getShiftCalendars(ids, date, date),
    dinasOn(ids, date),
    prisma.overtime.findMany({ where: { userId: { in: ids }, date, status: { in: OT_ACTIVE } }, select: { userId: true, startTime: true, endTime: true, order: { select: { number: true } } } }),
  ]);
  // Lembur lain di tanggal itu hanya ditolak bila jamnya bertabrakan (mis. pagi sebelum shift + sore sesudah shift boleh).
  const busyOf = (userId: string, r: SplRowInput) => busy.find((b) => b.userId === userId && isTime(r.startTime) && isTime(r.endTime) && otOverlap(b, r));
  const seen = new Set<string>();
  const out: SplRowCheck[] = [];
  for (const r of rows) {
    const u = org.byId.get(r.userId);
    const rest = isRestDay(cal[r.userId]?.[keyOf(date)], date);
    const okTime = isTime(r.startTime) && isTime(r.endTime) && r.startTime !== r.endTime;
    const plan = okTime ? otPlan(r.startTime, r.endTime, rest) : { hours: 0, breaks: [] as string[], overnight: false };
    let problem: string | null = null;
    if (!u) problem = "Karyawan tidak aktif / tidak ditemukan.";
    else if (seen.has(r.userId)) problem = "Karyawan ini sudah ada di SPL ini.";
    else if (r.userId === adminId) problem = "Admin tidak boleh membuat SPL untuk dirinya sendiri.";
    else if (org.isTop(r.userId)) problem = "Pimpinan puncak tidak bisa diberi lembur.";
    else if (!okTime) problem = "Isi jam mulai dan jam selesai (berbeda).";
    else if (plan.hours < 1) problem = `Lembur minimal 1 jam (di luar istirahat ${otBreakText(rest)}).`;
    else if (busyOf(r.userId, r)) { const b = busyOf(r.userId, r)!; problem = `Sudah terdaftar lembur ${b.startTime}–${b.endTime}${b.order ? ` di ${b.order.number}` : " (pengajuan karyawan)"}.`; }
    else if (dinas.has(r.userId)) problem = `Sedang ${dinas.get(r.userId)}; tidak bisa lembur.`;
    else if (final && !r.reason.trim()) problem = "Uraian pekerjaan wajib diisi.";
    else {
      const clash = (await shiftConflicts([r.userId], date, r.startTime, r.endTime)).get(r.userId);
      if (clash) problem = `Bentrok shift: ${clash}.`;
    }
    seen.add(r.userId);
    out.push({ ...r, reason: r.reason.trim(), name: u?.name ?? "", employeeId: u?.employeeId ?? null, rest, hours: plan.hours, breaks: plan.breaks, estimate: null, problem });
  }
  // Estimasi dibayar per 1 jam penuh, sama seperti pembayaran.
  const ok = out.filter((x) => !x.problem);
  const costs = await estimateOvertimeCost(ok.map((x) => ({ userId: x.userId, date: dateStr, hours: Math.floor(x.hours), rest: x.rest })));
  ok.forEach((x, i) => { x.estimate = costs[i] ?? 0; });
  return { error: undefined as string | undefined, rows: out, date };
}

export const rupiah = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;

// ─── Pembatalan lembur SPL (Admin Lembur, atau atasan di atas atasan langsung) ──
export async function cancelSplOvertime(id: string, by: { id: string; name: string }, reason: string) {
  const o = await prisma.overtime.findUnique({ where: { id }, include: { order: { select: { number: true, createdBy: true } }, user: { select: { name: true } } } });
  if (!o || !o.orderId || !["MENUNGGU_KARYAWAN", "DISETUJUI"].includes(o.status)) return { error: "Lembur ini tidak bisa dibatalkan." };
  if (!reason.trim()) return { error: "Tulis alasan pembatalan." };
  const att = await prisma.attendance.findFirst({ where: { userId: o.userId, date: o.date, checkOut: { not: null } } });
  if (att) return { error: "Karyawan sudah absen pulang di tanggal itu; lembur tidak bisa dibatalkan." };
  await prisma.overtime.update({ where: { id }, data: { status: "DIBATALKAN", decidedBy: by.name, decidedAt: new Date(), note: reason.trim() } });
  const when = `${formatDate(o.date)} · ${o.startTime}–${o.endTime}`;
  const why = ` Alasan: ${reason.trim()}`;
  await notify(o.userId, `Lembur ${o.order?.number ?? ""} dibatalkan`, `${when}. Dibatalkan oleh ${by.name}.${why}`, "/portal/lembur");
  // Tembusan: rantai atasan karyawan dan Admin pembuat SPL (kecuali yang membatalkan).
  const org = await orgChart();
  const chain = org.chain(o.userId).filter((x) => x !== by.id);
  if (chain.length) await notify(chain, `Info: lembur ${o.user.name} dibatalkan`, `${o.order?.number ?? ""} · ${when}. Dibatalkan oleh ${by.name}.${why}`, "/portal/lembur?tim=1");
  const creator = o.order?.createdBy ? await prisma.user.findFirst({ where: { name: o.order.createdBy, role: { in: ["ADMIN", "SUPER_ADMIN"] } }, select: { id: true } }) : null;
  if (creator && creator.id !== by.id && !chain.includes(creator.id)) {
    await notify(creator.id, `Info: lembur ${o.user.name} dibatalkan`, `${o.order?.number ?? ""} · ${when}. Dibatalkan oleh ${by.name}.${why}`, "/portal/admin/lembur");
  }
  return {};
}

// ─── Lembur Tim: SPL karyawan di bawah seorang atasan ──────────────────────
export type TeamOvertime = {
  id: string; name: string; employeeId: string | null; date: string; start: string; end: string; reason: string | null;
  status: string; spl: string | null; hours: number; rest: boolean; estimate: number | null; direct: boolean; canCancel: boolean;
  note: string | null; decidedBy: string | null;
  // Cek fisik security & laporan ke atasan langsung.
  checkIn: string | null; checkOut: string | null; checks: { name: string; at: string; present: boolean }[] | null;
  verifyStatus: string | null; verifyBy: string | null; verifyNote: string | null; canVerify: boolean;
};
const hhmm = (d: Date) => new Date(d.getTime() + 7 * 3600_000).toISOString().slice(11, 16);
export async function teamSpl(viewerId: string): Promise<TeamOvertime[] | null> {
  const org = await orgChart();
  const level = new Map<string, number>();
  for (const u of org.users) { const i = org.chain(u.id).indexOf(viewerId); if (i >= 0) level.set(u.id, i); }
  if (!level.size) return null;
  const since = new Date(Date.now() - 30 * 86_400_000);
  const rows = await prisma.overtime.findMany({
    where: { userId: { in: [...level.keys()] }, orderId: { not: null }, OR: [{ date: { gte: since } }, { status: "MENUNGGU_KARYAWAN" }] },
    include: { order: { select: { number: true } }, checks: { orderBy: { createdAt: "asc" } } }, orderBy: [{ date: "desc" }, { startTime: "asc" }], take: 200,
  });
  const restSet = await restDaysOf(rows);
  const atts = rows.length
    ? await prisma.attendance.findMany({ where: { OR: rows.map((r) => ({ userId: r.userId, date: r.date })) }, select: { userId: true, date: true, checkIn: true, checkOut: true } })
    : [];
  const attBy = new Map(atts.map((a) => [restKey(a.userId, a.date), a]));
  const out = new Set(atts.filter((a) => a.checkOut).map((a) => restKey(a.userId, a.date)));
  const view = rows.map((r) => {
    const rest = restSet.has(restKey(r.userId, r.date));
    const direct = level.get(r.userId) === 0;
    const active = ["MENUNGGU_KARYAWAN", "DISETUJUI"].includes(r.status);
    const u = org.byId.get(r.userId);
    return {
      id: r.id, name: u?.name ?? "", employeeId: u?.employeeId ?? null, date: keyOf(r.date), start: r.startTime, end: r.endTime, reason: r.reason,
      status: r.status, spl: r.order?.number ?? null, hours: otPlan(r.startTime, r.endTime, rest).hours, rest, estimate: null as number | null,
      direct, canCancel: !direct && active && !out.has(restKey(r.userId, r.date)), note: r.note, decidedBy: r.decidedBy,
      checkIn: attBy.get(restKey(r.userId, r.date))?.checkIn ? hhmm(attBy.get(restKey(r.userId, r.date))!.checkIn!) : null,
      checkOut: attBy.get(restKey(r.userId, r.date))?.checkOut ? hhmm(attBy.get(restKey(r.userId, r.date))!.checkOut!) : null,
      checks: r.checkerIds.length ? r.checks.map((c) => ({ name: c.checkerName, at: hhmm(c.createdAt), present: c.present })) : null,
      verifyStatus: r.verifyStatus, verifyBy: r.verifyBy, verifyNote: r.verifyNote, canVerify: direct && r.verifyStatus === "MENUNGGU",
    };
  });
  // Estimasi hanya untuk atasan di atas atasan langsung, pada lembur yang masih berjalan.
  const est = view.filter((v) => !v.direct && ["MENUNGGU_KARYAWAN", "DISETUJUI"].includes(v.status));
  const costs = await estimateOvertimeCost(est.map((v) => ({ userId: rows.find((r) => r.id === v.id)!.userId, date: v.date, hours: Math.floor(v.hours), rest: v.rest })));
  est.forEach((v, i) => { v.estimate = costs[i] ?? 0; });
  return view;
}
