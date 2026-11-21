// Keputusan Setujui / Tolak pengajuan Cuti, Dinas Luar, Lembur, dan Lupa Absen. Dipakai dua pintu dengan aturan
// yang sama: menu Persetujuan di portal (penyetuju = sesi login) dan tombol di Telegram (penyetuju = pemilik chat).
// Aturan: hanya penyetuju yang berhak (atasan langsung / giliran level Workflow), pengajuan tidak bisa diputus dua kali,
// alasan wajib saat menolak.
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { canDecide } from "@/lib/approval";
import { assessAttendance } from "@/lib/attendance-assess";
import { decideStep, notifyInfo } from "@/lib/workflow-settings";
import { readApproval } from "@/lib/onboarding-interview";
import { dateRange, decisionText, notify } from "@/lib/notify";
import { applyFix, fixRefresh, hmWib } from "@/lib/attendance-fix";
import { askApprovers } from "@/lib/telegram-approval";
import { routeTo } from "@/lib/delegation";
import { activeManager, applySwap, hasAttendance, periodFinal } from "@/lib/shift-swap";

export type Actor = { id: string; role: string; name: string | null };
type Result = { error?: string };

function workflowDecision(raw: unknown, userId: string, approve: boolean, note: string, name: string | null) {
  const flow = readApproval(raw);
  if (!flow) return null;
  return decideStep(flow, userId, approve, note, name);
}

function refresh() {
  for (const p of ["/portal/persetujuan", "/portal/notifikasi", "/portal/cuti", "/portal/dinas", "/portal/dashboard", "/portal/admin/leave"]) revalidatePath(p);
  revalidatePath("/portal/admin/karyawan", "layout");
}

// Setujui atau tolak pengajuan cuti. Alasan wajib saat menolak.
export async function decideLeaveAs(a: Actor, id: string, approve: boolean, note: string): Promise<Result> {
  const req = await prisma.leaveRequest.findUnique({ where: { id }, include: { policy: { select: { name: true } } } });
  if (!req || req.status !== "PENDING") return { error: "Pengajuan tidak ditemukan atau sudah diputus." };
  if (!approve && !note.trim()) return { error: "Tulis alasan penolakan." };
  const wf = workflowDecision(req.approval, a.id, approve, note, a.name);
  if (wf && "error" in wf) return { error: wf.error };
  if (wf && !wf.rejected && !wf.done) {
    // Level berikutnya masih harus memutus.
    await prisma.leaveRequest.update({ where: { id }, data: { approval: wf.approval } });
    await askApprovers("leave", id);
    refresh();
    return {};
  }
  if (!wf && !(await canDecide(a, req.userId))) return { error: "Anda bukan penyetuju pengajuan ini." };
  await prisma.leaveRequest.update({
    where: { id },
    data: { status: approve ? "APPROVED" : "REJECTED", approvedBy: a.name, approvedAt: new Date(), note: note.trim() || null, ...(wf ? { approval: wf.approval } : {}) },
  });
  // Alpha otomatis di tanggal cuti yang disetujui langsung dihapus.
  if (approve) await assessAttendance(req.startDate, req.endDate, [req.userId]);
  // Delegasi tanggung jawab: pengajuan baru untuk pemohon dialihkan ke delegasi selama tanggal cuti.
  if (approve && req.delegateId) {
    const who = await prisma.user.findUnique({ where: { id: req.userId }, select: { name: true } });
    await notify(req.delegateId, "Anda menjadi delegasi tanggung jawab",
      `${who?.name ?? ""} cuti ${dateRange(req.startDate, req.endDate)}. Pengajuan baru yang biasanya ia putuskan akan masuk ke Anda selama tanggal itu.`, "/portal/notifikasi");
  }
  if (approve && wf) {
    const who = await prisma.user.findUnique({ where: { id: req.userId }, select: { name: true } });
    await notifyInfo(wf.approval, `Info: ${who?.name ?? "Karyawan"} ${req.policy?.name ?? "cuti"}`, `${dateRange(req.startDate, req.endDate)} · ${req.totalDays} hari · disetujui ${a.name ?? ""}`.trim());
  }
  await notify(req.userId, `Pengajuan ${req.policy?.name ?? "cuti"} ${approve ? "disetujui" : "ditolak"}`,
    `${dateRange(req.startDate, req.endDate)} · ${decisionText(approve, a.name, note)}`, "/portal/cuti", { telegram: true });
  refresh();
  return {};
}

export async function decideTripAs(a: Actor, id: string, approve: boolean, note: string): Promise<Result> {
  const trip = await prisma.businessTrip.findUnique({ where: { id } });
  if (!trip || trip.status !== "PENDING") return { error: "Pengajuan tidak ditemukan atau sudah diputus." };
  if (!approve && !note.trim()) return { error: "Tulis alasan penolakan." };
  const wf = workflowDecision(trip.approval, a.id, approve, note, a.name);
  if (wf && "error" in wf) return { error: wf.error };
  if (wf && !wf.rejected && !wf.done) {
    await prisma.businessTrip.update({ where: { id }, data: { approval: wf.approval } });
    await askApprovers("trip", id);
    refresh();
    return {};
  }
  if (!wf && !(await canDecide(a, trip.userId))) return { error: "Anda bukan penyetuju pengajuan ini." };
  await prisma.businessTrip.update({
    where: { id },
    data: { status: approve ? "APPROVED" : "REJECTED", approvedBy: a.name, approvedAt: new Date(), note: note.trim() || null, ...(wf ? { approval: wf.approval } : {}) },
  });
  if (approve) await assessAttendance(trip.startDate, trip.endDate, [trip.userId]);
  if (approve && wf) {
    const who = await prisma.user.findUnique({ where: { id: trip.userId }, select: { name: true } });
    await notifyInfo(wf.approval, `Info: ${who?.name ?? "Karyawan"} dinas luar ${trip.destination}`, `${dateRange(trip.startDate, trip.endDate)} · disetujui ${a.name ?? ""}`.trim());
  }
  await notify(trip.userId, `Dinas luar ${trip.destination} ${approve ? "disetujui" : "ditolak"}`,
    `${dateRange(trip.startDate, trip.endDate)} · ${decisionText(approve, a.name, note)}`, "/portal/dinas", { telegram: true });
  refresh();
  return {};
}

// Pengajuan lembur karyawan (bila SPL tidak dipakai): atasan langsung / Workflow modul Lembur.
export async function decideOvertimeAs(a: Actor, id: string, approve: boolean, note: string): Promise<Result> {
  const o = await prisma.overtime.findUnique({ where: { id } });
  if (!o || o.status !== "PENDING") return { error: "Pengajuan tidak ditemukan atau sudah diputus." };
  if (!approve && !note.trim()) return { error: "Tulis alasan penolakan." };
  const wf = workflowDecision(o.approval, a.id, approve, note, a.name);
  if (wf && "error" in wf) return { error: wf.error };
  if (wf && !wf.rejected && !wf.done) {
    await prisma.overtime.update({ where: { id }, data: { approval: wf.approval } });
    await askApprovers("overtime", id);
    refresh();
    revalidatePath("/portal/lembur");
    return {};
  }
  if (!wf && !(await canDecide(a, o.userId))) return { error: "Anda bukan penyetuju pengajuan ini." };
  await prisma.overtime.update({
    where: { id },
    data: { status: approve ? "APPROVED" : "REJECTED", decidedBy: a.name, decidedAt: new Date(), note: note.trim() || null, ...(wf ? { approval: wf.approval } : {}) },
  });
  if (approve && wf) {
    const who = await prisma.user.findUnique({ where: { id: o.userId }, select: { name: true } });
    await notifyInfo(wf.approval, `Info: ${who?.name ?? "Karyawan"} lembur`, `${dateRange(o.date, o.date)} · ${o.startTime}–${o.endTime} · disetujui ${a.name ?? ""}`.trim());
  }
  await notify(o.userId, `Pengajuan lembur ${approve ? "disetujui" : "ditolak"}`,
    `${dateRange(o.date, o.date)} · ${o.startTime}–${o.endTime} · ${decisionText(approve, a.name, note)}`, "/portal/lembur", { telegram: true });
  refresh();
  revalidatePath("/portal/lembur");
  return {};
}

// Lupa Absen: atasan langsung / Workflow modul Lupa Absen. Disetujui level terakhir → jam langsung dicatat di kehadiran.
export async function decideFixAs(a: Actor, id: string, approve: boolean, note: string): Promise<Result> {
  const f = await prisma.attendanceCorrection.findUnique({ where: { id } });
  if (!f || f.status !== "PENDING") return { error: "Pengajuan tidak ditemukan atau sudah diputus." };
  if (!approve && !note.trim()) return { error: "Tulis alasan penolakan." };
  const wf = workflowDecision(f.approval, a.id, approve, note, a.name);
  if (wf && "error" in wf) return { error: wf.error };
  if (wf && !wf.rejected && !wf.done) {
    await prisma.attendanceCorrection.update({ where: { id }, data: { approval: wf.approval } });
    await askApprovers("fix", id);
    fixRefresh();
    return {};
  }
  if (!wf && !(await canDecide(a, f.userId))) return { error: "Anda bukan penyetuju pengajuan ini." };
  await prisma.attendanceCorrection.update({
    where: { id },
    data: { status: approve ? "APPROVED" : "REJECTED", decidedBy: a.name, decidedAt: new Date(), note: note.trim() || null, ...(wf ? { approval: wf.approval } : {}) },
  });
  if (approve) await applyFix(f, a.name);
  const jam = [f.checkIn && `masuk ${hmWib(f.checkIn)}`, f.checkOut && `pulang ${hmWib(f.checkOut)}`].filter(Boolean).join(" · ");
  if (approve && wf) {
    const who = await prisma.user.findUnique({ where: { id: f.userId }, select: { name: true } });
    await notifyInfo(wf.approval, `Info: ${who?.name ?? "Karyawan"} lupa absen`, `${dateRange(f.date, f.date)} · ${jam} · disetujui ${a.name ?? ""}`.trim());
  }
  await notify(f.userId, `Lupa absen ${approve ? "disetujui" : "ditolak"}`, `${dateRange(f.date, f.date)} · ${jam} · ${decisionText(approve, a.name, note)}`, "/portal/lupa-absen", { telegram: true });
  fixRefresh();
  return {};
}

// ─── Tukar shift: rekan menerima / menolak, lalu atasan langsung kedua karyawan memutus ───
const SWAP_ATT = "Salah satu karyawan sudah check-in/check-out di tanggal itu, tukar shift tidak bisa lagi.";
function swapRefresh() {
  for (const p of ["/portal/tukar-shift", "/portal/persetujuan", "/portal/notifikasi", "/portal/dashboard", "/portal/profil", "/portal/admin/schedule"]) revalidatePath(p);
  revalidatePath("/portal/admin/karyawan", "layout");
}

// Rekan menerima / menolak. Diterima → diteruskan ke atasan langsung kedua karyawan.
export async function respondSwapAs(a: Actor, id: string, accept: boolean, note: string): Promise<Result> {
  const r = await prisma.shiftSwapRequest.findUnique({ where: { id } });
  if (!r || r.partnerId !== a.id || r.status !== "MENUNGGU_REKAN") return { error: "Pengajuan tidak ditemukan atau sudah diproses." };
  if (!accept) {
    await prisma.shiftSwapRequest.update({ where: { id }, data: { status: "DITOLAK", note: note.trim() || "Ditolak rekan", decidedBy: a.name, decidedAt: new Date() } });
    await notify(r.requesterId, "Tukar shift ditolak rekan", `${dateRange(r.date, r.date)} · ${decisionText(false, a.name, note)}`, "/portal/tukar-shift", { telegram: true });
    swapRefresh();
    return {};
  }
  if (await hasAttendance([r.requesterId, r.partnerId], r.date)) return { error: SWAP_ATT };
  const [ma0, mb0] = await Promise.all([activeManager(r.requesterId), activeManager(r.partnerId)]);
  if (!ma0 || !mb0) return { error: "Atasan langsung salah satu karyawan belum diatur. Hubungi HRD." };
  // Atasan yang sedang cuti dengan delegasi → dialihkan ke delegasinya.
  const [ma, mb] = await Promise.all([
    routeTo({ id: ma0, name: "" }, r.requesterId).then((x) => x.id),
    routeTo({ id: mb0, name: "" }, r.partnerId).then((x) => x.id),
  ]);
  await prisma.shiftSwapRequest.update({
    where: { id },
    data: { status: "MENUNGGU_ATASAN", partnerAt: new Date(), managerAId: ma, managerBId: mb === ma ? null : mb },
  });
  await askApprovers("swap", id);
  swapRefresh();
  return {};
}

// Atasan langsung pemohon / rekan menyetujui atau menolak. Setelah semua atasan setuju, shift ditukar.
export async function decideSwapAs(a: Actor, id: string, approve: boolean, note: string): Promise<Result> {
  const r = await prisma.shiftSwapRequest.findUnique({ where: { id } });
  if (!r || r.status !== "MENUNGGU_ATASAN") return { error: "Pengajuan tidak ditemukan atau sudah diputus." };
  const isA = r.managerAId === a.id && !r.managerAAt;
  const isB = r.managerBId === a.id && !r.managerBAt;
  if (!isA && !isB) return { error: "Anda bukan penyetuju pengajuan ini." };
  if (!approve) {
    if (!note.trim()) return { error: "Tulis alasan penolakan." };
    await prisma.shiftSwapRequest.update({ where: { id }, data: { status: "DITOLAK", note: note.trim(), decidedBy: a.name, decidedAt: new Date() } });
    await notify([r.requesterId, r.partnerId], "Tukar shift ditolak", `${dateRange(r.date, r.date)} · ${decisionText(false, a.name, note)}`, "/portal/tukar-shift", { telegram: true });
    swapRefresh();
    return {};
  }
  if (await hasAttendance([r.requesterId, r.partnerId], r.date)) return { error: SWAP_ATT };
  if (await periodFinal(r.date)) return { error: "Periode gaji bulan itu sudah final." };
  const now = new Date();
  const data = { ...(isA ? { managerAAt: now, managerAName: a.name } : {}), ...(isB ? { managerBAt: now, managerBName: a.name } : {}) };
  const doneA = isA || !!r.managerAAt;
  const doneB = !r.managerBId || isB || !!r.managerBAt;
  if (doneA && doneB) {
    const res = await applySwap(r, a.name);
    if (res.error) return { error: res.error };
    await prisma.shiftSwapRequest.update({ where: { id }, data: { ...data, status: "DISETUJUI", note: note.trim() || null, decidedBy: a.name, decidedAt: now } });
    await notify([r.requesterId, r.partnerId], "Tukar shift disetujui", `${dateRange(r.date, r.date)} · ${decisionText(true, a.name)} Shift sudah ditukar.`, "/portal/tukar-shift", { telegram: true });
  } else {
    await prisma.shiftSwapRequest.update({ where: { id }, data });
  }
  swapRefresh();
  return {};
}
