import { prisma } from "@/lib/prisma";

const keyOf = (d: Date) => d.toISOString().slice(0, 10);
const utc = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

// Hari ini menurut WIB, sebagai tanggal UTC tengah malam.
function todayDate() {
  const text = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
  return new Date(`${text}T00:00:00Z`);
}

// Tanggal "genap n bulan" sejak start (31 Jan + 1 bulan = 28/29 Feb).
function addMonths(start: Date, n: number) {
  const y = start.getUTCFullYear(), m = start.getUTCMonth() + n, d = start.getUTCDate();
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(d, last)));
}

export type BalanceRow = {
  userId: string; name: string; employeeId: string; status: string; department: string | null;
  policyId: string; code: string; policyName: string;
  opening: number | null; openingDate: string | null; // saldo awal dari aplikasi lama
  earned: number; used: number; adjusted: number; expired: number; balance: number;
  nextDate: string | null; nextDays: number | null; // penambahan berikutnya
  problem: string | null; // mis. tanggal masuk kosong
};

// Jenis cuti yang punya saldo: Cuti Tahunan (jatah per tahun) dan cuti dengan penambahan bulanan.
export const hasBalance = (p: { category: string; quota: number | null; period: string; accrualPerMonth: number }) =>
  p.accrualPerMonth > 0 || (p.category === "TAHUNAN" && p.period === "TAHUN" && p.quota !== null);

// Saldo cuti semua karyawan aktif. Yang dihitung otomatis:
// - Cuti bulanan (Cuti Masa Kontrak): +X hari tiap genap 1 bulan sejak tanggal masuk.
// - Cuti tahunan: tiap ulang tahun kerja (setelah masa kerja minimal) saldo direset ke sisa
//   yang boleh dibawa, lalu ditambah jatah setahun. Angka bertambah/terpakai/hangus yang
//   dikembalikan untuk periode berjalan saja.
// - Pemakaian: pengajuan Cuti Tahunan yang disetujui, dihitung dari tanggal mulainya.
// Titik awal hitungan adalah SALDO_AWAL terbaru (migrasi dari aplikasi lama); tanpa itu,
// dihitung dari tanggal masuk. Karyawan resign (nonaktif) tidak punya saldo.
export async function computeBalances(): Promise<BalanceRow[]> {
  const today = todayDate();
  const [policies, employees, entries, requests] = await Promise.all([
    prisma.leavePolicy.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    prisma.user.findMany({
      where: { isActive: true, role: { not: "SUPER_ADMIN" } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, employeeId: true, employmentStatus: true, gender: true, joinDate: true, department: { select: { name: true } } },
    }),
    prisma.leaveBalanceEntry.findMany({ orderBy: { date: "asc" } }),
    prisma.leaveRequest.findMany({ where: { status: "APPROVED", type: "TAHUNAN" }, select: { userId: true, startDate: true, totalDays: true } }),
  ]);
  const tracked = policies.filter(hasBalance);
  const rows: BalanceRow[] = [];

  for (const e of employees) {
    const gender = e.gender?.toUpperCase().startsWith("P") ? "P" : e.gender?.toUpperCase().startsWith("L") ? "L" : null;
    for (const p of tracked) {
      if (p.forStatus && p.forStatus !== e.employmentStatus) continue;
      if (p.gender && gender && p.gender !== gender) continue;

      const mine = entries.filter((x) => x.userId === e.id && x.policyId === p.id);
      const opening = [...mine].reverse().find((x) => x.kind === "SALDO_AWAL") ?? null;
      const join = e.joinDate ? utc(e.joinDate) : null;
      const from = opening ? utc(opening.date) : join;
      const base = {
        userId: e.id, name: e.name, employeeId: e.employeeId ?? "", status: e.employmentStatus, department: e.department?.name ?? null,
        policyId: p.id, code: p.code, policyName: p.name,
        opening: opening ? opening.days : null, openingDate: opening ? keyOf(opening.date) : null,
      };
      if (!join || !from) {
        rows.push({ ...base, earned: 0, used: 0, adjusted: 0, expired: 0, balance: opening?.days ?? 0, nextDate: null, nextDays: null, problem: "Tanggal masuk kosong" });
        continue;
      }

      // Kejadian setelah titik awal, diurutkan menurut tanggal.
      type Ev = { t: number; kind: "grant" | "reset" | "use" | "adjust"; days: number };
      const evs: Ev[] = [];
      let nextDate: Date | null = null;
      let nextDays: number | null = null;
      if (p.accrualPerMonth > 0) {
        for (let n = 1; n < 1200; n++) {
          const d = addMonths(join, n);
          if (d > today) { nextDate = d; nextDays = p.accrualPerMonth; break; }
          if (d > from) evs.push({ t: d.getTime(), kind: "grant", days: p.accrualPerMonth });
        }
      } else {
        const first = Math.max(12, p.minServiceMonths);
        for (let n = first; n < 1200; n += 12) {
          const d = addMonths(join, n);
          if (d > today) { nextDate = d; nextDays = p.quota ?? 0; break; }
          if (d > from) evs.push({ t: d.getTime(), kind: "reset", days: p.quota ?? 0 });
        }
      }
      for (const r of requests) if (r.userId === e.id && utc(r.startDate) >= from) evs.push({ t: utc(r.startDate).getTime(), kind: "use", days: r.totalDays });
      for (const x of mine) if (x.kind === "PENYESUAIAN" && utc(x.date) >= from) evs.push({ t: utc(x.date).getTime(), kind: "adjust", days: x.days });
      evs.sort((a, b) => a.t - b.t || (a.kind === "reset" ? -1 : 1));

      let bal = opening?.days ?? 0, earned = 0, used = 0, adjusted = 0, expired = 0;
      for (const ev of evs) {
        if (ev.kind === "grant") { bal += ev.days; earned += ev.days; }
        else if (ev.kind === "reset") {
          // Periode baru: angka yang ditampilkan hanya untuk periode berjalan.
          const keep = Math.min(Math.max(bal, 0), p.carryOverDays);
          expired = Math.max(bal, 0) - keep;
          bal = keep + ev.days; earned = keep + ev.days; used = 0; adjusted = 0;
        } else if (ev.kind === "use") { bal -= ev.days; used += ev.days; }
        else { bal += ev.days; adjusted += ev.days; }
      }
      rows.push({
        ...base, earned, used, adjusted, expired, balance: Math.round(bal * 100) / 100,
        nextDate: nextDate ? keyOf(nextDate) : null, nextDays, problem: null,
      });
    }
  }
  return rows;
}

