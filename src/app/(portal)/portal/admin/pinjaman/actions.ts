"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getAccess } from "@/lib/access";
import { isManagement, isSuperAdmin } from "@/lib/roles";
import { buildSchedule, isPeriod } from "@/lib/loans";
import { nextLoanNo } from "@/lib/loan-view";

const PATH = "/portal/admin/pinjaman";
type Result = { error?: string };

// Pinjaman dikelola Admin dan Super Admin; upload saldo awal migrasi hanya Super Admin.
async function requireAdmin() {
  const access = await getAccess();
  if (!access || !isManagement(access.role)) throw new Error("Unauthorized");
  return access;
}
const refresh = (userId?: string) => {
  revalidatePath(PATH);
  revalidatePath("/portal/pinjaman");
  revalidatePath("/portal/dashboard");
  if (userId) revalidatePath(`/portal/admin/karyawan/${userId}`);
};
const terms = (principal: number, tenor: number, startPeriod: string) => {
  const p = Math.round(Number(principal) || 0), n = Math.round(Number(tenor) || 0);
  if (p < 1000) return { error: "Jumlah pinjaman wajib diisi." } as const;
  if (n < 1 || n > 120) return { error: "Jumlah angsuran 1-120 kali." } as const;
  if (!isPeriod(startPeriod)) return { error: "Periode potongan pertama tidak valid." } as const;
  return { p, n } as const;
};

// Setujui pengajuan (jumlah, tenor, periode mulai boleh disesuaikan) dan susun tabel angsuran.
// Angsuran baru dipotong setelah pinjaman ditandai dicairkan.
export async function approveLoan(id: string, input: { principal: number; tenor: number; startPeriod: string; note: string }): Promise<Result> {
  const access = await requireAdmin();
  const loan = await prisma.employeeLoan.findUnique({ where: { id } });
  if (!loan || loan.status !== "PENDING") return { error: "Pengajuan tidak ditemukan atau sudah diproses." };
  const tm = terms(input.principal, input.tenor, input.startPeriod);
  if ("error" in tm) return { error: tm.error };
  await prisma.$transaction([
    prisma.employeeLoan.update({
      where: { id },
      data: { principal: tm.p, tenor: tm.n, startPeriod: input.startPeriod, status: "DISETUJUI", note: input.note.trim() || null, approvedBy: access.name ?? null, approvedAt: new Date() },
    }),
    prisma.loanInstallment.createMany({ data: buildSchedule(tm.p, tm.n, input.startPeriod).map((r) => ({ ...r, loanId: id })) }),
  ]);
  refresh(loan.userId);
  return {};
}

export async function rejectLoan(id: string, note: string): Promise<Result> {
  const access = await requireAdmin();
  const loan = await prisma.employeeLoan.findUnique({ where: { id } });
  if (!loan || loan.status !== "PENDING") return { error: "Pengajuan tidak ditemukan atau sudah diproses." };
  await prisma.employeeLoan.update({ where: { id }, data: { status: "DITOLAK", note: note.trim() || null, approvedBy: access.name ?? null, approvedAt: new Date() } });
  refresh(loan.userId);
  return {};
}

// Tandai uang pinjaman sudah diberikan ke karyawan (manual). Sejak itu angsuran ikut dipotong di Proses Gaji.
export async function markDisbursed(id: string, date: string): Promise<Result> {
  const access = await requireAdmin();
  const loan = await prisma.employeeLoan.findUnique({ where: { id } });
  if (!loan || loan.status !== "DISETUJUI") return { error: "Hanya pinjaman yang sudah disetujui yang bisa dicairkan." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Tanggal pencairan wajib diisi." };
  await prisma.employeeLoan.update({
    where: { id }, data: { status: "BERJALAN", disbursedAt: new Date(`${date}T00:00:00Z`), disbursedBy: access.name ?? null },
  });
  refresh(loan.userId);
  return {};
}

// Simpan ulang angsuran yang belum terpotong. Angsuran yang sudah terpotong lewat Proses Gaji tidak bisa diubah;
// total sisa angsuran harus sama dengan sisa pinjaman.
export async function saveSchedule(loanId: string, rows: { period: string; amount: number }[]): Promise<Result> {
  await requireAdmin();
  const loan = await prisma.employeeLoan.findUnique({ where: { id: loanId }, include: { installments: true } });
  if (!loan || !["DISETUJUI", "BERJALAN"].includes(loan.status)) return { error: "Hanya pinjaman disetujui atau berjalan yang bisa diubah." };
  const paid = loan.installments.filter((i) => i.status === "LUNAS");
  const remaining = loan.principal - paid.reduce((a, i) => a + i.amount, 0);
  const clean = rows.map((r) => ({ period: r.period, amount: Math.round(Number(r.amount) || 0) })).filter((r) => r.amount > 0);
  if (clean.some((r) => !isPeriod(r.period))) return { error: "Periode angsuran tidak valid." };
  const total = clean.reduce((a, r) => a + r.amount, 0);
  if (Math.round(total) !== Math.round(remaining)) {
    return { error: `Total angsuran (Rp${total.toLocaleString("id-ID")}) harus sama dengan sisa pinjaman (Rp${Math.round(remaining).toLocaleString("id-ID")}).` };
  }
  const sorted = [...clean].sort((a, b) => a.period.localeCompare(b.period));
  const lastSeq = paid.reduce((m, i) => Math.max(m, i.seq), 0);
  await prisma.$transaction([
    prisma.loanInstallment.deleteMany({ where: { loanId, status: { not: "LUNAS" } } }),
    prisma.loanInstallment.createMany({ data: sorted.map((r, i) => ({ loanId, seq: lastSeq + i + 1, period: r.period, amount: r.amount })) }),
    prisma.employeeLoan.update({ where: { id: loanId }, data: { tenor: paid.length + sorted.length, ...(sorted.length ? {} : { status: "LUNAS" }) } }),
  ]);
  refresh(loan.userId);
  return {};
}

// Batalkan pinjaman yang belum ada angsuran terpotong. Saldo awal migrasi hanya bisa dibatalkan Super Admin.
export async function cancelLoan(id: string): Promise<Result> {
  const access = await requireAdmin();
  const loan = await prisma.employeeLoan.findUnique({ where: { id }, include: { installments: true } });
  if (!loan || !["DISETUJUI", "BERJALAN"].includes(loan.status)) return { error: "Pinjaman tidak bisa dibatalkan." };
  if (loan.isOpening && !isSuperAdmin(access.role)) return { error: "Saldo awal migrasi hanya bisa diubah Super Admin." };
  if (loan.installments.some((i) => i.status === "LUNAS")) return { error: "Sudah ada angsuran terpotong; ubah sisa angsuran saja." };
  await prisma.employeeLoan.update({ where: { id }, data: { status: "BATAL" } });
  refresh(loan.userId);
  return {};
}

// Upload saldo awal migrasi (Super Admin): sisa pinjaman dan sisa angsuran per karyawan dari aplikasi lama.
// Langsung berjalan karena uangnya sudah dicairkan di aplikasi lama.
export type OpeningRow = { employeeId: string; remaining: number; tenor: number; startPeriod: string; original: number | null; note: string };
export async function importOpeningLoans(rows: OpeningRow[]): Promise<Result & { count?: number; errors?: string[] }> {
  const access = await requireAdmin();
  if (!isSuperAdmin(access.role)) return { error: "Upload saldo awal hanya untuk Super Admin." };
  const users = await prisma.user.findMany({ where: { employeeId: { in: rows.map((r) => r.employeeId.trim()) } }, select: { id: true, employeeId: true } });
  const byId = new Map(users.map((u) => [u.employeeId!.toLowerCase(), u.id]));
  const errors: string[] = [];
  const ready: { userId: string; p: number; n: number; r: OpeningRow }[] = [];
  rows.forEach((r, i) => {
    const userId = byId.get(r.employeeId.trim().toLowerCase());
    const tm = terms(r.remaining, r.tenor, r.startPeriod);
    if (!userId) errors.push(`Baris ${i + 2}: Employee ID ${r.employeeId} tidak ditemukan`);
    else if ("error" in tm) errors.push(`Baris ${i + 2}: ${tm.error}`);
    else ready.push({ userId, p: tm.p, n: tm.n, r });
  });
  if (errors.length) return { error: "Ada baris yang belum benar; tidak ada yang disimpan.", errors };
  for (const x of ready) {
    await prisma.employeeLoan.create({
      data: {
        userId: x.userId, seqNo: await nextLoanNo(x.userId), principal: x.p, tenor: x.n, startPeriod: x.r.startPeriod,
        purpose: x.r.note.trim() || "Saldo awal migrasi", status: "BERJALAN", isOpening: true,
        originalAmount: Number(x.r.original) > 0 ? Number(x.r.original) : null,
        createdBy: access.name ?? null, approvedBy: access.name ?? null, approvedAt: new Date(),
        installments: { create: buildSchedule(x.p, x.n, x.r.startPeriod) },
      },
    });
  }
  refresh();
  return { count: ready.length };
}
