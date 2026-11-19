// Pengajuan Lupa Absen (keputusan pemilik 2026-11-18).
// - Karyawan yang lupa check-in / check-out, atau check-out-nya ditolak karena lewat batas jam absen, mengajukan jam
//   sebenarnya dari menu Lupa Absen. Penyetuju = atasan langsung, atau Workflow modul "Lupa Absen" bila aktif.
// - Setelah level terakhir menyetujui, jam itu langsung dicatat di kehadiran (tanpa pemeriksaan Admin), lalu potongan
//   dan lembur dihitung seperti biasa. Ditolak = absen tetap tidak lengkap dan diselesaikan Admin di Laporan.
// - Check-out yang belum selesai menahan check-in berikutnya sampai Lupa Absen untuk tanggal itu diajukan.
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { workflowSteps } from "@/lib/workflow-settings";
import { withDelegation } from "@/lib/delegation";
import { firstApproverName, hasApprover } from "@/lib/approval";
import { assessAttendance, openAttendance, wibToday } from "@/lib/attendance-assess";
import { periodFinal } from "@/lib/shift-swap";
import { formatDate } from "@/lib/utils";

const DAY = 86_400_000;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
// Status pengajuan yang masih/sudah menyelesaikan absen tanggal itu.
export const FIX_LIVE = ["PENDING", "APPROVED"];
// Jam "HH:MM" WIB pada tanggal kerja `date`.
const atWib = (date: Date, hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(date.getTime() + (h * 60 + m) * 60_000 - 7 * 3600_000);
};
export const hmWib = (d: Date | null | undefined) => (d ? new Date(d.getTime() + 7 * 3600_000).toISOString().slice(11, 16) : "");

export function fixRefresh() {
  try {
    for (const p of ["/portal/lupa-absen", "/portal/absensi", "/portal/kehadiran", "/portal/persetujuan", "/portal/notifikasi", "/portal/dashboard", "/portal/admin/laporan"]) revalidatePath(p);
    revalidatePath("/portal/admin/karyawan", "layout");
  } catch {
    // Dipanggil di luar request Next (skrip uji): tidak ada cache yang perlu diperbarui.
  }
}

export type FixInput = { date: string; checkIn: string; checkOut: string; reason: string };
export async function submitFixFor(u: { id: string; name: string | null }, input: FixInput): Promise<{ error?: string; approver?: string }> {
  if (!DATE.test(input.date)) return { error: "Pilih tanggal absen." };
  const date = new Date(`${input.date}T00:00:00Z`);
  const today = wibToday();
  if (date > today) return { error: "Tanggal absen tidak boleh setelah hari ini." };
  if (date.getTime() < today.getTime() - 31 * DAY) return { error: "Lupa Absen hanya untuk 31 hari terakhir. Hubungi Admin untuk tanggal yang lebih lama." };
  if (!input.reason.trim()) return { error: "Tulis alasan lupa absen." };
  if (await periodFinal(date)) return { error: "Periode gaji bulan itu sudah final." };

  const [att, open] = await Promise.all([
    prisma.attendance.findUnique({ where: { userId_date: { userId: u.id, date } }, select: { checkIn: true, checkOut: true, status: true } }),
    prisma.attendanceCorrection.findFirst({ where: { userId: u.id, date, status: "PENDING" }, select: { id: true } }),
  ]);
  if (open) return { error: "Masih ada pengajuan Lupa Absen yang menunggu persetujuan untuk tanggal itu." };
  if (att && ["CUTI", "DINAS", "IZIN", "SAKIT"].includes(att.status)) return { error: "Tanggal itu tercatat cuti / izin / dinas, bukan hari masuk." };
  const needIn = !att?.checkIn, needOut = !att?.checkOut;
  if (!needIn && !needOut) return { error: "Absen tanggal itu sudah lengkap." };

  // Satu pengajuan = satu jam saja (keputusan pemilik 2026-11-19):
  // - belum ada jam masuk → lupa check-in: hanya jam masuk yang diajukan, jam pulang tidak bisa diisi;
  // - jam masuk sudah tercatat → lupa check-out: jam masuk tetap, cukup isi jam pulang.
  // Lupa keduanya sekaligus tidak dilayani lewat menu ini.
  let checkIn: Date | null = null, checkOut: Date | null = null;
  if (needIn) {
    // Tanggal lewat tanpa jam masuk = tidak check-in dan tidak check-out sama sekali → bukan Lupa Absen.
    if (date < today) return { error: "Tanggal itu tidak ada jam masuk maupun jam pulang. Lupa Absen hanya untuk salah satunya; hubungi atasan Anda." };
    if (!TIME.test(input.checkIn)) return { error: "Isi jam masuk." };
    if (input.checkOut) return { error: "Jam masuk belum tercatat, jadi yang bisa diajukan hanya jam masuk." };
    checkIn = atWib(date, input.checkIn);
  } else if (needOut) {
    if (!TIME.test(input.checkOut)) return { error: "Isi jam pulang." };
    const base = checkIn ?? att?.checkIn ?? null;
    checkOut = atWib(date, input.checkOut);
    // Jam pulang lebih kecil dari jam masuk = lewat tengah malam (hari berikutnya).
    if (base && checkOut <= base) checkOut = new Date(checkOut.getTime() + DAY);
  }
  const now = Date.now();
  if ((checkIn && checkIn.getTime() > now) || (checkOut && checkOut.getTime() > now)) return { error: "Jam yang diajukan belum terjadi." };
  if (!checkIn && !checkOut) return { error: "Isi jam yang lupa diabsen." };

  const wf = await workflowSteps("LUPA_ABSEN", u.id);
  if (wf.error) return { error: wf.error };
  if (!wf.flow && !(await hasApprover(u.id))) return { error: "Atasan langsung Anda belum diatur atau sudah tidak aktif, jadi pengajuan belum bisa dikirim. Hubungi HRD." };
  const flow = await withDelegation(wf.flow, u.id);
  await prisma.attendanceCorrection.create({
    data: { userId: u.id, date, checkIn, checkOut, reason: input.reason.trim().slice(0, 500), ...(flow ? { approval: flow } : {}) },
  });
  fixRefresh();
  return { approver: await firstApproverName(flow, u.id) };
}

// Terapkan pengajuan yang sudah disetujui ke kehadiran.
export async function applyFix(fix: { userId: string; date: Date; checkIn: Date | null; checkOut: Date | null }, by: string | null) {
  const note = `Lupa absen disetujui ${by ?? "atasan"}`;
  const att = await prisma.attendance.findUnique({ where: { userId_date: { userId: fix.userId, date: fix.date } } });
  if (att) {
    await prisma.attendance.update({
      where: { id: att.id },
      data: {
        ...(fix.checkIn && !att.checkIn ? { checkIn: fix.checkIn } : {}),
        ...(fix.checkOut && !att.checkOut ? { checkOut: fix.checkOut } : {}),
        ...(att.status === "ALPHA" ? { status: "HADIR" as const } : {}),
        note: att.note && !att.note.startsWith("Otomatis:") ? `${att.note} · ${note}` : note,
      },
    });
  } else {
    await prisma.attendance.create({ data: { userId: fix.userId, date: fix.date, checkIn: fix.checkIn, checkOut: fix.checkOut, status: "HADIR", note } });
  }
  await assessAttendance(fix.date, fix.date, [fix.userId]);
}

// Check-out sebelumnya yang belum selesai dan belum diajukan Lupa Absen: menahan check-in pada tanggal kerja `workDate`.
export async function unfinishedCheckout(userId: string, workDate: Date) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { attendanceExempt: true } });
  if (u?.attendanceExempt) return null;
  const prev = await prisma.attendance.findFirst({
    where: { userId, date: { lt: workDate, gte: new Date(workDate.getTime() - 31 * DAY) } },
    orderBy: { date: "desc" }, select: { id: true, date: true, checkIn: true, checkOut: true },
  });
  if (!prev?.checkIn || prev.checkOut) return null;
  const fix = await prisma.attendanceCorrection.findFirst({ where: { userId, date: prev.date, status: { in: FIX_LIVE } }, select: { id: true } });
  if (fix) return null;
  const yesterday = prev.date.getTime() === workDate.getTime() - DAY;
  const when = yesterday ? "kemarin" : `tanggal ${formatDate(prev.date)}`;
  // Masih bisa check-out biasa (shift malam / lembur lewat tengah malam dalam batas absen pulang).
  if ((await openAttendance(userId))?.id === prev.id) return `Selesaikan terlebih dahulu check-out ${when}.`;
  return `Selesaikan terlebih dahulu check-out ${when} melalui menu Pengajuan Absen.`;
}
