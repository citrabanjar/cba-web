import { prisma } from "@/lib/prisma";
import type { PayParams } from "@/lib/payroll";
import { getPayrollSettings } from "@/lib/payroll-settings";

const utc = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

// Perkiraan potongan terlambat / pulang cepat untuk pop-up absen, memakai rumus yang sama dengan Proses Gaji
// (komponen PER_JAM berparameter "Jam terlambat + pulang cepat" yang tertempel ke karyawan):
// dasar nilai / jumlah hari bulan berjalan / jam per hari (atau lama shift hari itu) x jam dipotong.
// null = tidak ada komponen potongan, gaji belum diisi, atau karyawan Bebas Absen (pop-up tanpa nominal).
export async function estimatePenaltyCut(userId: string, date: Date, hours: number, shiftHours: number): Promise<number | null> {
  if (hours <= 0) return null;
  const day = utc(date);
  const [components, user, salary, settings] = await Promise.all([
    prisma.payComponent.findMany({ where: { isActive: true }, include: { employees: { where: { userId }, select: { startDate: true, endDate: true } } } }),
    prisma.user.findUnique({ where: { id: userId }, select: { attendanceExempt: true, paymentSchedule: true } }),
    prisma.employeeSalary.findFirst({ where: { userId, effectiveDate: { lte: day } }, orderBy: { effectiveDate: "desc" }, include: { components: true } }),
    getPayrollSettings(),
  ]);
  if (!user || user.attendanceExempt || !salary) return null;
  const tempel = new Set(components.filter((c) => c.employees.some((e) => (!e.startDate || utc(e.startDate) <= day) && (!e.endDate || utc(e.endDate) >= day))).map((c) => c.code));
  const cuts = components.filter((c) => tempel.has(c.code) && c.kind === "POTONGAN" && c.method === "PER_JAM" && c.param === "JAM_TELAT_PULANG_CEPAT");
  if (cuts.length === 0) return null;

  // Dasar nilai sama dengan Proses Gaji: gaji pokok (harian x pengali untuk karyawan mingguan), komponen tertentu, atau upah tetap.
  const daily = salary.dailyWage ?? 0, factor = salary.monthlyFactor ?? 0;
  const basic = user.paymentSchedule === "Mingguan" && daily > 0 && factor > 0 ? daily * factor : salary.basicSalary ?? 0;
  const masterCodes = new Set(components.map((c) => c.code));
  const live = (c: { code: string | null }) => !c.code || !masterCodes.has(c.code) || tempel.has(c.code);
  const allowances = salary.components.filter((c) => c.type === "TUNJANGAN" && live(c));
  const fixedCodes = new Set(components.filter((c) => (c.params as PayParams | null)?.fixedWage).map((c) => c.code));
  const fixedTotal = basic + allowances.filter((a) => !a.code || !masterCodes.has(a.code) || fixedCodes.has(a.code)).reduce((x, a) => x + a.amount, 0)
    + components.filter((c) => tempel.has(c.code) && c.method === "NOMINAL" && fixedCodes.has(c.code)).reduce((a, c) => a + (c.amount ?? 0), 0);
  const values: Record<string, number> = { GP: basic };
  for (const x of salary.components) if (x.code && live(x)) values[x.code] = (values[x.code] ?? 0) + x.amount;
  for (const c of components) if (tempel.has(c.code) && c.method === "NOMINAL") values[c.code] = (values[c.code] ?? 0) + (c.amount ?? 0);
  const baseOf = (c: (typeof cuts)[number]) =>
    c.base === "GAJI_POKOK" ? basic : c.base === "KOMPONEN" ? c.baseCodes.reduce((x, code) => x + (values[code] ?? 0), 0) : fixedTotal;

  // Pembagi hari = jumlah hari bulan berjalan.
  const monthDays = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + 1, 0)).getUTCDate();
  const total = cuts.reduce((sum, c) => {
    const p = (c.params ?? {}) as PayParams;
    const perHour = baseOf(c) / monthDays / (p.shiftHours && shiftHours > 0 ? shiftHours : p.hoursPerDay || 8);
    return sum + perHour * hours;
  }, 0);
  const r = settings.rounding || 1;
  const amount = Math.round(total / r) * r;
  return amount > 0 ? amount : null;
}
