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

// Alur pengajuan pinjaman karyawan: atasan langsung → pemeriksaan dokumen fisik oleh Admin → keputusan pimpinan puncak.
// stage hanya berlaku saat status PENDING; null = pengajuan lama (langsung ke pemeriksaan Admin).
export const LOAN_STAGE: Record<string, string> = {
  ATASAN: "Menunggu persetujuan atasan",
  ADMIN: "Dalam pemeriksaan Admin",
  PIMPINAN: "Menunggu keputusan pimpinan",
};
export const loanStageOf = (status: string, stage: string | null | undefined) => (status === "PENDING" ? stage || "ADMIN" : null);
// Rencana angsuran hasil pemeriksaan Admin (dijalankan saat pimpinan puncak menyetujui) + ringkasannya untuk pimpinan.
export type LoanPlan = {
  principal: number; tenor: number; startPeriod: string; installment?: number; mergeIds: string[];
  total: number; count: number; first: number; last: number; endPeriod: string; merged: string[]; before: number; after: number;
};
// Satu level menu Workflow (pre = level sebelum pemeriksaan Admin; level terakhir disimpan sebagai top*).
export type LoanStep = { id: string; ids?: string[]; name: string; decision: "" | "SETUJU" | "TOLAK"; at: string; note: string; by?: string };
export const loanStepIds = (s: { id: string; ids?: string[] }) => (s.ids?.length ? s.ids : [s.id]);
export type LoanFlow = {
  workflow?: boolean; pre?: LoanStep[]; topIds?: string[]; who?: string[]; // jalur menu Workflow; who = semua penyetuju (untuk pencarian)
  managerId?: string; managerName?: string; managerAt?: string; managerNote?: string;
  topId?: string; topName?: string; topAt?: string; topNote?: string; topBy?: string;
  adminId?: string; adminName?: string; adminAt?: string; adminNote?: string; plan?: LoanPlan;
  request?: LoanPlan; // permohonan karyawan saat masih ada pinjaman berjalan (hitung ulang angsuran bila mergeIds terisi)
};
export const readLoanFlow = (raw: unknown): LoanFlow => (raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as LoanFlow) : {});
// Penyetuju level sebelum pemeriksaan Admin yang sedang mendapat giliran.
export const loanPreStep = (f: LoanFlow) => f.pre?.find((x) => !x.decision) ?? null;
export const loanTopIds = (f: LoanFlow) => (f.topIds?.length ? f.topIds : f.topId ? [f.topId] : []);
// Giliran user ini memutus: tahap ATASAN (atasan langsung / level Workflow sebelum Admin) atau PIMPINAN (pimpinan puncak / level terakhir).
export function loanTurn(status: string, stage: string | null | undefined, f: LoanFlow, userId: string) {
  if (status !== "PENDING") return false;
  if (stage === "ATASAN") {
    if (f.pre) { const st = loanPreStep(f); return !!st && loanStepIds(st).includes(userId); }
    return f.managerId === userId;
  }
  return stage === "PIMPINAN" && loanTopIds(f).includes(userId);
}
// Penyetuju sebelum pemeriksaan Admin (selalu melihat pengajuannya).
export const loanEarlyApprover = (f: LoanFlow, userId: string) => f.managerId === userId || !!f.pre?.some((x) => loanStepIds(x).includes(userId));
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
// Jadwal angsuran paling banyak 120 kali; di atas itu cukup dibuat 121 baris supaya pemanggil menolak tanpa membuat jutaan baris.
const MAX_ROWS = 120;
export function buildSchedule(principal: number, tenor: number, startPeriod: string): ScheduleRow[] {
  const n = Math.min(MAX_ROWS + 1, Math.max(1, Math.round(tenor)));
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
  // Batas 121 baris: lebih dari 120 kali sudah pasti ditolak, dan nominal kecil (mis. saat baru mengetik "1")
  // tidak boleh membuat jutaan baris yang membuat browser macet.
  if (n > MAX_ROWS) return Array.from({ length: MAX_ROWS + 1 }, (_, i) => ({ seq: i + 1, period: addMonths(startPeriod, i), status: "BELUM", amount: each }));
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
