import { prisma } from "@/lib/prisma";
import { getShiftCalendars } from "@/lib/schedule";
import { jakartaToday } from "@/lib/work-location";

// Data tab Jadwal Bulanan: karyawan (jadwal manual, atau semua) dan shift per tanggal dalam sebulan.
export async function loadRoster(bulan: string | undefined, showAll: boolean) {
  const now = jakartaToday();
  const match = /^(\d{4})-(\d{2})$/.exec(bulan ?? "");
  const year = match ? Number(match[1]) : now.getUTCFullYear();
  const month = match ? Number(match[2]) - 1 : now.getUTCMonth();

  const monthStart = new Date(Date.UTC(year, month, 1));
  const monthEnd = new Date(Date.UTC(year, month + 1, 0));
  // Seminggu sebelum awal bulan ikut dimuat untuk fitur "isi dari minggu sebelumnya".
  const from = new Date(monthStart.getTime() - 7 * 86_400_000);

  const employees = await prisma.user.findMany({
    where: { isActive: true, role: { not: "SUPER_ADMIN" } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, employeeId: true, department: { select: { name: true } } },
  });
  const calendars = await getShiftCalendars(employees.map((e) => e.id), from, monthEnd);

  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
  const monthDates = Array.from({ length: monthEnd.getUTCDate() }, (_, i) => `${monthKey}-${String(i + 1).padStart(2, "0")}`);
  const rows = employees
    .map((e) => {
      const days = calendars[e.id] ?? {};
      // Karyawan tanpa jadwal (belum ditempel pola kerja / jadwal manual) di bulan ini:
      // jumlah hari kosongnya. Yang jadwalnya baru mulai di tengah bulan tidak dihitung.
      const noSchedule = monthDates.every((k) => !days[k] || days[k].override);
      const unscheduled = noSchedule ? monthDates.filter((k) => !days[k]).length : 0;
      return { id: e.id, name: e.name, employeeId: e.employeeId ?? "", department: e.department?.name ?? null, days, unscheduled };
    })
    // Filter "Jadwal Manual": karyawan jadwal manual, yang punya isian per tanggal, dan yang belum punya jadwal.
    .filter((r) => showAll || r.unscheduled > 0
      || Object.entries(r.days).some(([k, d]) => k.startsWith(monthKey) && (d.manual || d.override)));

  return { year, month, showAll, rows };
}

// Hari kerja yang belum punya shift dalam satu bulan roster: total, jumlah karyawan, dan per tanggal.
// Belum punya shift = jadwal manual belum diisi, atau karyawan tanpa jadwal sama sekali.
export function unfilledIn({ rows, year, month }: Awaited<ReturnType<typeof loadRoster>>) {
  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const byDate = new Map<string, number>();
  let total = 0;
  let people = 0;
  for (const r of rows) {
    let n = 0;
    for (let i = 1; i <= days; i++) {
      const k = `${monthKey}-${String(i).padStart(2, "0")}`;
      const d = r.days[k];
      if (d ? d.manual : r.unscheduled > 0) {
        n += 1;
        byDate.set(k, (byDate.get(k) ?? 0) + 1);
      }
    }
    total += n;
    if (n > 0) people += 1;
  }
  return { total, people, byDate };
}
