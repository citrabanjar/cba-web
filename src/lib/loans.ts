// Pinjaman karyawan (tanpa bunga): jadwal angsuran dan ringkasan. Aman dipakai di server dan browser.
// Alur: PENDING (diajukan) → DISETUJUI (belum dicairkan) → BERJALAN (dicairkan, angsuran dipotong) → LUNAS.

export const LOAN_STATUS: Record<string, { label: string; tone: string }> = {
  PENDING: { label: "Menunggu persetujuan", tone: "bg-amber-50 text-amber-700" },
  DISETUJUI: { label: "Disetujui, menunggu pencairan", tone: "bg-violet-50 text-violet-700" },
  BERJALAN: { label: "Berjalan", tone: "bg-sky-50 text-sky-700" },
  LUNAS: { label: "Lunas", tone: "bg-emerald-50 text-emerald-700" },
  DITOLAK: { label: "Ditolak", tone: "bg-rose-50 text-rose-700" },
  BATAL: { label: "Dibatalkan", tone: "bg-gray-100 text-gray-500" },
  DIGABUNG: { label: "Digabung", tone: "bg-indigo-50 text-indigo-700" },
};
export const loanStatusLabel = (s: string) => LOAN_STATUS[s]?.label ?? s;
export const LOAN_GROUPS = [
  { key: "menunggu", label: "Menunggu", statuses: ["PENDING", "DISETUJUI"] },
  { key: "berjalan", label: "Berjalan", statuses: ["BERJALAN"] },
  { key: "selesai", label: "Selesai", statuses: ["LUNAS", "DIGABUNG", "DITOLAK", "BATAL"] },
] as const;

export type ScheduleRow = { seq: number; period: string; amount: number; status: string };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
export const isPeriod = (p: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(p);
export function addMonths(period: string, n: number) {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
export const periodShort = (period: string) => {
  const [y, m] = period.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
};

// Angsuran rata dibulatkan ke bawah ribuan; selisihnya masuk angsuran terakhir supaya total = pokok.
export function buildSchedule(principal: number, tenor: number, startPeriod: string): ScheduleRow[] {
  const n = Math.max(1, Math.round(tenor));
  const each = Math.floor(principal / n / 1000) * 1000 || Math.floor(principal / n);
  return Array.from({ length: n }, (_, i) => ({
    seq: i + 1, period: addMonths(startPeriod, i), status: "BELUM",
    amount: i === n - 1 ? principal - each * (n - 1) : each,
  }));
}

// Angsuran dengan nominal tetap per bulan; angsuran terakhir = sisanya.
export function buildScheduleByAmount(principal: number, amount: number, startPeriod: string): ScheduleRow[] {
  const each = Math.max(1, Math.round(amount));
  const n = Math.max(1, Math.ceil(principal / each - 1e-9));
  return Array.from({ length: n }, (_, i) => ({
    seq: i + 1, period: addMonths(startPeriod, i), status: "BELUM",
    amount: i === n - 1 ? principal - each * (n - 1) : each,
  }));
}

// Sisa pinjaman = angsuran yang belum terpotong.
export const unpaidTotal = (rows: { amount: number; status: string }[]) => rows.filter((r) => r.status !== "LUNAS").reduce((a, r) => a + r.amount, 0);

export function loanSummary(principal: number, rows: { amount: number; status: string; period: string }[]) {
  const paid = rows.filter((r) => r.status === "LUNAS").reduce((a, r) => a + r.amount, 0);
  const next = rows.filter((r) => r.status !== "LUNAS").sort((a, b) => a.period.localeCompare(b.period))[0];
  return { paid, remaining: Math.max(0, principal - paid), paidCount: rows.filter((r) => r.status === "LUNAS").length, next };
}
