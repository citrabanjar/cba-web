import type { LeavePolicy, LeaveType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getShiftCalendar } from "@/lib/schedule";

const DAY = 86_400_000;
const keyOf = (d: Date) => d.toISOString().slice(0, 10);
const utc = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const round = (n: number) => Math.round(n * 100) / 100;

// Hari ini menurut WIB, sebagai tanggal UTC tengah malam.
export function todayDate() {
  const text = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
  return new Date(`${text}T00:00:00Z`);
}

// Tanggal "genap n bulan" sejak start (31 Jan + 1 bulan = 28/29 Feb).
export function addMonths(start: Date, n: number) {
  const y = start.getUTCFullYear(), m = start.getUTCMonth() + n, d = start.getUTCDate();
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(d, last)));
}

// Satu baris riwayat mutasi saldo, seperti buku tabungan.
export type LedgerLine = { date: string; label: string; days: number; balance: number };

export type BalanceRow = {
  userId: string; name: string; employeeId: string; status: string; department: string | null;
  policyId: string; code: string; policyName: string;
  opening: number | null; openingDate: string | null; // saldo awal dari aplikasi lama
  earned: number; used: number; adjusted: number; expired: number; balance: number;
  pending: number; // hari pada pengajuan yang masih menunggu keputusan
  nextDate: string | null; nextDays: number | null; // penambahan berikutnya
  problem: string | null; // mis. tanggal masuk kosong
  ledger: LedgerLine[];
};

// Jenis cuti yang punya saldo: Cuti Tahunan (jatah per tahun) dan cuti dengan penambahan bulanan.
export const hasBalance = (p: { category: string; quota: number | null; period: string; accrualPerMonth: number }) =>
  p.accrualPerMonth > 0 || (p.category === "TAHUNAN" && p.period === "TAHUN" && p.quota !== null);

export const genderOf = (g: string | null | undefined) =>
  g?.toUpperCase().startsWith("P") ? "P" : g?.toUpperCase().startsWith("L") ? "L" : null;

// Jenis cuti yang boleh dipakai seorang karyawan (status kerja, jenis kelamin, masa kerja).
export function eligible(
  p: Pick<LeavePolicy, "isActive" | "forStatus" | "gender" | "minServiceMonths">,
  e: { employmentStatus: string; gender: string | null; joinDate: Date | null },
  today = todayDate(),
) {
  if (!p.isActive) return false;
  if (p.forStatus && p.forStatus !== e.employmentStatus) return false;
  const g = genderOf(e.gender);
  if (p.gender && g && p.gender !== g) return false;
  if (p.minServiceMonths > 0 && (!e.joinDate || addMonths(utc(e.joinDate), p.minServiceMonths) > today)) return false;
  return true;
}

// Enum lama di LeaveRequest diturunkan dari kategori Setup Leave.
export function legacyType(category: string): LeaveType {
  if (category === "TAHUNAN") return "TAHUNAN";
  if (category === "SAKIT") return "SAKIT";
  if (category === "MELAHIRKAN") return "MELAHIRKAN";
  if (category === "KHUSUS") return "PENTING";
  return "LAINNYA";
}

// Jumlah hari cuti dalam rentang tanggal. Hari kerja mengikuti jadwal karyawan (shift bukan OFF);
// kalau karyawan belum punya jadwal, dihitung Senin–Sabtu di luar hari libur.
export async function countLeaveDays(userId: string, start: Date, end: Date, unit: string) {
  const calendarDays = Math.round((utc(end).getTime() - utc(start).getTime()) / DAY) + 1;
  if (unit !== "HARI_KERJA") return calendarDays;
  const [cal, holidays] = await Promise.all([
    getShiftCalendar(userId, utc(start), utc(end)),
    prisma.holiday.findMany({ where: { date: { gte: utc(start), lte: utc(end) } }, select: { date: true } }),
  ]);
  const off = new Set(holidays.map((h) => keyOf(h.date)));
  let n = 0;
  for (let t = utc(start).getTime(); t <= utc(end).getTime(); t += DAY) {
    const k = keyOf(new Date(t));
    const s = cal[k];
    // Jadwal manual yang belum diisi dianggap hari kerja.
    if (s) { if (!s.isOff) n += 1; continue; }
    if (new Date(t).getUTCDay() !== 0 && !off.has(k)) n += 1;
  }
  return n;
}

// Saldo cuti karyawan aktif (semua, atau hanya userIds). Yang dihitung otomatis:
// - Cuti bulanan (Cuti Masa Kontrak): +X hari tiap genap 1 bulan sejak tanggal masuk.
// - Cuti tahunan: tiap ulang tahun kerja (setelah masa kerja minimal) saldo direset ke sisa
//   yang boleh dibawa, lalu ditambah jatah setahun. Angka bertambah/terpakai/hangus yang
//   dikembalikan untuk periode berjalan saja; riwayat mutasi memuat semuanya.
// - Pemakaian: pengajuan yang disetujui untuk jenis itu, pengajuan lama "Cuti Tahunan", dan
//   jenis lain yang ditandai "Potong cuti tahunan".
// Titik awal hitungan adalah SALDO_AWAL terbaru (migrasi dari aplikasi lama); tanpa itu,
// dihitung dari tanggal masuk. Karyawan resign (nonaktif) tidak punya saldo.
export async function computeBalances(userIds?: string[]): Promise<BalanceRow[]> {
  const today = todayDate();
  const whereUser = userIds ? { userId: { in: userIds } } : {};
  const [policies, employees, entries, requests] = await Promise.all([
    prisma.leavePolicy.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    prisma.user.findMany({
      where: { isActive: true, role: { not: "SUPER_ADMIN" }, ...(userIds ? { id: { in: userIds } } : {}) },
      orderBy: { name: "asc" },
      select: { id: true, name: true, employeeId: true, employmentStatus: true, gender: true, joinDate: true, department: { select: { name: true } } },
    }),
    prisma.leaveBalanceEntry.findMany({ where: whereUser, orderBy: { date: "asc" } }),
    prisma.leaveRequest.findMany({
      where: { ...whereUser, status: { in: ["APPROVED", "PENDING"] } },
      select: { userId: true, startDate: true, endDate: true, totalDays: true, status: true, type: true, policyId: true, policy: { select: { code: true, name: true, deductsAnnual: true } } },
    }),
  ]);
  const tracked = policies.filter(hasBalance);
  const rows: BalanceRow[] = [];

  for (const e of employees) {
    for (const p of tracked) {
      if (p.forStatus && p.forStatus !== e.employmentStatus) continue;
      const g = genderOf(e.gender);
      if (p.gender && g && p.gender !== g) continue;

      const mine = entries.filter((x) => x.userId === e.id && x.policyId === p.id);
      const opening = [...mine].reverse().find((x) => x.kind === "SALDO_AWAL") ?? null;
      const join = e.joinDate ? utc(e.joinDate) : null;
      const from = opening ? utc(opening.date) : join;
      // Pengajuan yang memakai saldo ini.
      const usesThis = (r: (typeof requests)[number]) =>
        r.userId === e.id && (r.policyId === p.id || (!r.policyId && r.type === "TAHUNAN") || !!r.policy?.deductsAnnual);
      const pending = requests.filter((r) => usesThis(r) && r.status === "PENDING").reduce((a, r) => a + r.totalDays, 0);
      const base = {
        userId: e.id, name: e.name, employeeId: e.employeeId ?? "", status: e.employmentStatus, department: e.department?.name ?? null,
        policyId: p.id, code: p.code, policyName: p.name,
        opening: opening ? opening.days : null, openingDate: opening ? keyOf(opening.date) : null, pending,
      };
      if (!join || !from) {
        rows.push({
          ...base, earned: 0, used: 0, adjusted: 0, expired: 0, balance: opening?.days ?? 0, nextDate: null, nextDays: null,
          problem: "Tanggal masuk kosong",
          ledger: opening ? [{ date: keyOf(opening.date), label: "Saldo awal (aplikasi lama)", days: opening.days, balance: opening.days }] : [],
        });
        continue;
      }

      // Kejadian setelah titik awal, diurutkan menurut tanggal.
      type Ev = { t: number; kind: "grant" | "reset" | "use" | "adjust"; days: number; label: string };
      const evs: Ev[] = [];
      let nextDate: Date | null = null;
      let nextDays: number | null = null;
      if (p.accrualPerMonth > 0) {
        for (let n = 1; n < 1200; n++) {
          const d = addMonths(join, n);
          if (d > today) { nextDate = d; nextDays = p.accrualPerMonth; break; }
          if (d > from) evs.push({ t: d.getTime(), kind: "grant", days: p.accrualPerMonth, label: `Bertambah (genap ${n} bulan kerja)` });
        }
      } else {
        const first = Math.max(12, p.minServiceMonths);
        for (let n = first; n < 1200; n += 12) {
          const d = addMonths(join, n);
          if (d > today) { nextDate = d; nextDays = p.quota ?? 0; break; }
          if (d > from) evs.push({ t: d.getTime(), kind: "reset", days: p.quota ?? 0, label: `Jatah cuti setahun (masa kerja ${Math.round(n / 12)} tahun)` });
        }
      }
      for (const r of requests) {
        if (!usesThis(r) || r.status !== "APPROVED" || utc(r.startDate) < from) continue;
        evs.push({ t: utc(r.startDate).getTime(), kind: "use", days: r.totalDays, label: `${r.policy?.name ?? "Cuti Tahunan"} (${keyOf(r.startDate)} s/d ${keyOf(r.endDate)})` });
      }
      for (const x of mine) if (x.kind === "PENYESUAIAN" && utc(x.date) >= from) evs.push({ t: utc(x.date).getTime(), kind: "adjust", days: x.days, label: `Koreksi: ${x.note ?? ""}` });
      evs.sort((a, b) => a.t - b.t || (a.kind === "reset" ? -1 : 1));

      let bal = opening?.days ?? 0, earned = 0, used = 0, adjusted = 0, expired = 0;
      const ledger: LedgerLine[] = [];
      if (opening) ledger.push({ date: keyOf(opening.date), label: "Saldo awal (aplikasi lama)", days: opening.days, balance: round(bal) });
      for (const ev of evs) {
        const date = keyOf(new Date(ev.t));
        if (ev.kind === "grant") { bal += ev.days; earned += ev.days; ledger.push({ date, label: ev.label, days: ev.days, balance: round(bal) }); }
        else if (ev.kind === "reset") {
          // Periode baru: sisa di atas batas "boleh dibawa" hangus, lalu jatah setahun masuk.
          const keep = Math.min(Math.max(bal, 0), p.carryOverDays);
          expired = Math.max(bal, 0) - keep;
          if (expired > 0) { bal -= expired; ledger.push({ date, label: "Sisa cuti hangus", days: -expired, balance: round(bal) }); }
          bal = keep + ev.days; earned = keep + ev.days; used = 0; adjusted = 0;
          ledger.push({ date, label: ev.label, days: ev.days, balance: round(bal) });
        } else if (ev.kind === "use") { bal -= ev.days; used += ev.days; ledger.push({ date, label: ev.label, days: -ev.days, balance: round(bal) }); }
        else { bal += ev.days; adjusted += ev.days; ledger.push({ date, label: ev.label, days: ev.days, balance: round(bal) }); }
      }
      rows.push({
        ...base, earned, used, adjusted, expired, balance: round(bal),
        nextDate: nextDate ? keyOf(nextDate) : null, nextDays, problem: null, ledger,
      });
    }
  }
  return rows;
}
