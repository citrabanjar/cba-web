import { prisma } from "@/lib/prisma";
import { getShiftCalendars } from "@/lib/schedule";
import { assessAttendance } from "@/lib/attendance-assess";

// Aturan tukar shift dengan rekan (keputusan pemilik 2026-11-11):
// - satu tanggal: pemohon memakai shift rekan, rekan memakai shift pemohon (boleh salah satunya OFF);
// - urutan persetujuan: rekan → atasan langsung pemohon → atasan langsung rekan (sekali saja bila sama);
// - hanya selama KEDUA karyawan belum check-in/check-out di tanggal itu (dicek di setiap tahap);
// - tanpa batas jumlah; periode gaji yang sudah final tidak bisa diubah.

export { OPEN_SWAP, SWAP_STATUS } from "@/lib/shift-swap-status";

const key = (d: Date) => d.toISOString().slice(0, 10);

// Shift kedua karyawan di tanggal itu, beserta id WorkShift-nya (hari libur → shift OFF).
export async function swapShifts(aId: string, bId: string, date: Date) {
  const cal = await getShiftCalendars([aId, bId], date, date);
  const offShift = await prisma.workShift.findFirst({ where: { isOff: true, isActive: true }, orderBy: { sortOrder: "asc" }, select: { id: true, code: true } });
  const resolve = async (userId: string) => {
    const d = cal[userId]?.[key(date)];
    if (!d) return { error: "belum punya jadwal kerja di tanggal itu" } as const;
    if (d.manual) return { error: "shift-nya belum diisi di Jadwal Bulanan" } as const;
    if (d.holiday) return offShift ? { code: offShift.code, id: offShift.id, name: d.holiday } as const : { error: "libur tanpa shift OFF" } as const;
    const s = await prisma.workShift.findUnique({ where: { code: d.code }, select: { id: true } });
    return s ? { code: d.code, id: s.id, name: d.name, start: d.startTime, end: d.endTime } as const : { error: "shift tidak ditemukan" } as const;
  };
  return { a: await resolve(aId), b: await resolve(bId) };
}

// Sudah ada check-in atau check-out salah satu karyawan di tanggal itu?
export async function hasAttendance(userIds: string[], date: Date) {
  return (await prisma.attendance.count({ where: { userId: { in: userIds }, date, OR: [{ checkIn: { not: null } }, { checkOut: { not: null } }] } })) > 0;
}

export async function periodFinal(date: Date) {
  return !!(await prisma.payrollRun.findFirst({ where: { status: "FINAL", frequency: "BULANAN", period: key(date).slice(0, 7) }, select: { id: true } }));
}

// Atasan langsung aktif seorang karyawan (null bila tidak ada / tidak aktif).
export async function activeManager(userId: string) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { managerId: true, manager: { select: { id: true, isActive: true } } } });
  return u?.managerId && u.manager?.isActive && u.managerId !== userId ? u.managerId : null;
}

// Terapkan tukar shift ke Jadwal Bulanan kedua karyawan, lalu nilai ulang kehadirannya.
export async function applySwap(swap: { id: string; requesterId: string; partnerId: string; date: Date }, by: string | null) {
  const s = await swapShifts(swap.requesterId, swap.partnerId, swap.date);
  if ("error" in s.a || "error" in s.b) return { error: "Jadwal salah satu karyawan berubah. Ajukan ulang tukar shift." };
  const names = await prisma.user.findMany({ where: { id: { in: [swap.requesterId, swap.partnerId] } }, select: { id: true, name: true } });
  const nameOf = (id: string) => names.find((n) => n.id === id)?.name ?? "";
  await prisma.$transaction([
    prisma.employeeShiftDay.upsert({
      where: { userId_date: { userId: swap.requesterId, date: swap.date } },
      update: { shiftId: s.b.id, note: `Tukar shift dengan ${nameOf(swap.partnerId)}`, updatedBy: by },
      create: { userId: swap.requesterId, date: swap.date, shiftId: s.b.id, note: `Tukar shift dengan ${nameOf(swap.partnerId)}`, updatedBy: by },
    }),
    prisma.employeeShiftDay.upsert({
      where: { userId_date: { userId: swap.partnerId, date: swap.date } },
      update: { shiftId: s.a.id, note: `Tukar shift dengan ${nameOf(swap.requesterId)}`, updatedBy: by },
      create: { userId: swap.partnerId, date: swap.date, shiftId: s.a.id, note: `Tukar shift dengan ${nameOf(swap.requesterId)}`, updatedBy: by },
    }),
  ]);
  await assessAttendance(swap.date, swap.date, [swap.requesterId, swap.partnerId]);
  return {};
}

// Jumlah tukar shift yang menunggu keputusan atasan ini (badge Persetujuan).
export async function pendingSwapApprovals(managerId: string) {
  return prisma.shiftSwapRequest.count({
    where: { status: "MENUNGGU_ATASAN", OR: [{ managerAId: managerId, managerAAt: null }, { managerBId: managerId, managerBAt: null }] },
  });
}
