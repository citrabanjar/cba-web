"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getAccess } from "@/lib/access";
import { hasMenu, isSuperAdmin } from "@/lib/roles";
import { buildSchedule, isPeriod } from "@/lib/loans";

const PATH = "/portal/admin/pinjaman";
type Result = { error?: string };

async function requirePayroll() {
  const access = await getAccess();
  if (!access || !hasMenu(access, "gaji")) throw new Error("Unauthorized");
  return access;
}
const refresh = () => { revalidatePath(PATH); revalidatePath("/portal/pinjaman"); };
const terms = (principal: number, tenor: number, startPeriod: string) => {
  const p = Math.round(Number(principal) || 0), n = Math.round(Number(tenor) || 0);
  if (p < 1000) return { error: "Jumlah pinjaman wajib diisi." } as const;
  if (n < 1 || n > 120) return { error: "Jumlah angsuran 1-120 kali." } as const;
  if (!isPeriod(startPeriod)) return { error: "Periode potongan pertama tidak valid." } as const;
  return { p, n } as const;
};

// Setujui pengajuan (jumlah, tenor, dan periode mulai boleh disesuaikan) lalu buat tabel angsuran.
export async function approveLoan(id: string, input: { principal: number; tenor: number; startPeriod: string; note: string }): Promise<Result> {
  const access = await requirePayroll();
  const loan = await prisma.employeeLoan.findUnique({ where: { id } });
  if (!loan || loan.status !== "PENDING") return { error: "Pengajuan tidak ditemukan atau sudah diproses." };
  const tm = terms(input.principal, input.tenor, input.startPeriod);
  if ("error" in tm) return { error: tm.error };
  await prisma.$transaction([
    prisma.employeeLoan.update({
      where: { id },
      data: { principal: tm.p, tenor: tm.n, startPeriod: input.startPeriod, status: "BERJALAN", note: input.note.trim() || null, approvedBy: access.name ?? null, approvedAt: new Date() },
    }),
    prisma.loanInstallment.createMany({ data: buildSchedule(tm.p, tm.n, input.startPeriod).map((r) => ({ ...r, loanId: id })) }),
  ]);
  refresh();
  return {};
}

export async function rejectLoan(id: string, note: string): Promise<Result> {
  const access = await requirePayroll();
  const loan = await prisma.employeeLoan.findUnique({ where: { id } });
  if (!loan || loan.status !== "PENDING") return { error: "Pengajuan tidak ditemukan atau sudah diproses." };
  await prisma.employeeLoan.update({ where: { id }, data: { status: "DITOLAK", note: note.trim() || null, approvedBy: access.name ?? null, approvedAt: new Date() } });
  refresh();
  return {};
}

// Admin mencatat pinjaman langsung (sudah disetujui), termasuk saldo awal migrasi dari aplikasi lama:
// principal = sisa pinjaman per tanggal migrasi, tenor = sisa kali angsuran.
export async function createLoan(input: {
  userId: string; principal: number; tenor: number; startPeriod: string; purpose: string; isOpening: boolean; originalAmount: number | null;
}): Promise<Result> {
  const access = await requirePayroll();
  const user = await prisma.user.findUnique({ where: { id: input.userId }, select: { id: true } });
  if (!user) return { error: "Pilih karyawan." };
  const tm = terms(input.principal, input.tenor, input.startPeriod);
  if ("error" in tm) return { error: tm.error };
  await prisma.employeeLoan.create({
    data: {
      userId: user.id, principal: tm.p, tenor: tm.n, startPeriod: input.startPeriod, purpose: input.purpose.trim() || null,
      status: "BERJALAN", isOpening: !!input.isOpening, originalAmount: input.isOpening && Number(input.originalAmount) > 0 ? Number(input.originalAmount) : null,
      createdBy: access.name ?? null, approvedBy: access.name ?? null, approvedAt: new Date(),
      installments: { create: buildSchedule(tm.p, tm.n, input.startPeriod) },
    },
  });
  refresh();
  return {};
}

// Simpan ulang angsuran yang belum terpotong (nominal & periode bisa diubah, baris bisa ditambah/dihapus).
// Total angsuran yang belum terpotong harus sama dengan sisa pinjaman.
export async function saveSchedule(loanId: string, rows: { period: string; amount: number }[]): Promise<Result> {
  await requirePayroll();
  const loan = await prisma.employeeLoan.findUnique({ where: { id: loanId }, include: { installments: true } });
  if (!loan || loan.status !== "BERJALAN") return { error: "Hanya pinjaman berjalan yang bisa diubah." };
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
  refresh();
  return {};
}

// Batalkan pinjaman yang belum ada angsuran terpotong. Saldo awal migrasi hanya bisa dibatalkan Super Admin.
export async function cancelLoan(id: string): Promise<Result> {
  const access = await requirePayroll();
  const loan = await prisma.employeeLoan.findUnique({ where: { id }, include: { installments: true } });
  if (!loan || !["BERJALAN", "PENDING"].includes(loan.status)) return { error: "Pinjaman tidak bisa dibatalkan." };
  if (loan.isOpening && !isSuperAdmin(access.role)) return { error: "Saldo awal migrasi hanya bisa diubah Super Admin." };
  if (loan.installments.some((i) => i.status === "LUNAS")) return { error: "Sudah ada angsuran terpotong; ubah tabel angsuran saja." };
  await prisma.employeeLoan.update({ where: { id }, data: { status: "BATAL" } });
  refresh();
  return {};
}
