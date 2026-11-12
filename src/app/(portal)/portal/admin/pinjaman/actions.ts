"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getAccess } from "@/lib/access";
import { hasMenu, isSuperAdmin } from "@/lib/roles";
import { buildSchedule, buildScheduleByAmount, isPeriod, unpaidTotal } from "@/lib/loans";
import { nextLoanNo } from "@/lib/loan-view";

const PATH = "/portal/admin/pinjaman";
type Result = { error?: string };

// Pinjaman dikelola Admin dan Super Admin; upload saldo awal migrasi hanya Super Admin.
async function requireAdmin() {
  const access = await getAccess();
  if (!access || !hasMenu(access, "pinjaman")) throw new Error("Unauthorized");
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
// Opsi gabung: sisa pinjaman yang masih berjalan (dipilih) ditambahkan ke pinjaman baru menjadi satu pinjaman,
// dengan potongan per bulan (installment) atau jumlah angsuran (tenor) sesuai permintaan. Pinjaman lama ditutup
// berstatus DIGABUNG (angsuran yang sudah terpotong tetap tercatat); dana baru tercatat di originalAmount.
export async function approveLoan(id: string, input: {
  principal: number; tenor: number; startPeriod: string; note: string; installment?: number; mergeIds?: string[];
}): Promise<Result> {
  const access = await requireAdmin();
  const loan = await prisma.employeeLoan.findUnique({ where: { id } });
  if (!loan || loan.status !== "PENDING") return { error: "Pengajuan tidak ditemukan atau sudah diproses." };
  const cash = Math.round(Number(input.principal) || 0);
  if (cash < 1000) return { error: "Jumlah pinjaman wajib diisi." };
  if (!isPeriod(input.startPeriod)) return { error: "Periode potongan pertama tidak valid." };

  const mergeIds = [...new Set(input.mergeIds ?? [])];
  const olds = mergeIds.length
    ? await prisma.employeeLoan.findMany({ where: { id: { in: mergeIds } }, include: { installments: true }, orderBy: { seqNo: "asc" } })
    : [];
  if (olds.length !== mergeIds.length || olds.some((o) => o.userId !== loan.userId || o.status !== "BERJALAN")) {
    return { error: "Pinjaman yang digabung harus pinjaman berjalan milik karyawan yang sama." };
  }
  if (olds.some((o) => o.isOpening) && !isSuperAdmin(access.role)) return { error: "Saldo awal migrasi hanya bisa diubah Super Admin." };
  const moved = olds.map((o) => ({ o, rest: unpaidTotal(o.installments) }));
  const total = cash + moved.reduce((a, m) => a + m.rest, 0);

  const each = Math.round(Number(input.installment) || 0);
  let rows;
  if (each > 0) {
    if (each < 1000) return { error: "Potongan per bulan minimal Rp1.000." };
    rows = buildScheduleByAmount(total, each, input.startPeriod);
  } else {
    const n = Math.round(Number(input.tenor) || 0);
    if (n < 1) return { error: "Isi potongan per bulan atau jumlah angsuran." };
    rows = buildSchedule(total, n, input.startPeriod);
  }
  if (rows.length > 120) return { error: "Jumlah angsuran paling banyak 120 kali; naikkan potongan per bulan." };

  const fmt = (n: number) => `Rp${Math.round(n).toLocaleString("id-ID")}`;
  const mergeNote = moved.length
    ? `Gabungan: ${moved.map((m) => `Pinjaman ke-${m.o.seqNo} sisa ${fmt(m.rest)}`).join(", ")} + dana baru ${fmt(cash)}.`
    : "";
  const note = [mergeNote, input.note.trim()].filter(Boolean).join(" ") || null;
  await prisma.$transaction([
    ...moved.flatMap((m) => [
      prisma.loanInstallment.deleteMany({ where: { loanId: m.o.id, status: { not: "LUNAS" } } }),
      prisma.employeeLoan.update({
        where: { id: m.o.id },
        data: { status: "DIGABUNG", note: [m.o.note, `Sisa ${fmt(m.rest)} digabung ke Pinjaman ke-${loan.seqNo}.`].filter(Boolean).join(" ") },
      }),
    ]),
    prisma.employeeLoan.update({
      where: { id },
      data: {
        principal: total, tenor: rows.length, startPeriod: input.startPeriod, status: "DISETUJUI", note,
        originalAmount: moved.length ? cash : null, approvedBy: access.name ?? null, approvedAt: new Date(),
      },
    }),
    prisma.loanInstallment.createMany({ data: rows.map((r) => ({ ...r, loanId: id })) }),
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

// Hapus permanen pinjaman yang dibatalkan atau ditolak (tidak pernah ada angsuran terpotong).
// Saldo awal migrasi hanya bisa dihapus Super Admin.
export async function deleteLoan(id: string): Promise<Result> {
  const access = await requireAdmin();
  const loan = await prisma.employeeLoan.findUnique({ where: { id }, include: { installments: true } });
  if (!loan || !["BATAL", "DITOLAK"].includes(loan.status)) return { error: "Hanya pinjaman yang dibatalkan atau ditolak yang bisa dihapus." };
  if (loan.isOpening && !isSuperAdmin(access.role)) return { error: "Saldo awal migrasi hanya bisa diubah Super Admin." };
  if (loan.installments.some((i) => i.status === "LUNAS")) return { error: "Pinjaman ini punya angsuran terpotong, tidak bisa dihapus." };
  await prisma.employeeLoan.delete({ where: { id } });
  refresh(loan.userId);
  return {};
}

// Upload saldo awal migrasi (Super Admin): sisa pinjaman dan sisa angsuran per karyawan dari aplikasi lama.
// Langsung berjalan karena uangnya sudah dicairkan di aplikasi lama.
export type OpeningRow = { employeeId: string; remaining: number; tenor: number; installment?: number | null; startPeriod: string; original: number | null; note: string };
export async function importOpeningLoans(rows: OpeningRow[]): Promise<Result & { count?: number; errors?: string[] }> {
  const access = await requireAdmin();
  if (!isSuperAdmin(access.role)) return { error: "Upload saldo awal hanya untuk Super Admin." };
  const users = await prisma.user.findMany({ where: { employeeId: { in: rows.map((r) => r.employeeId.trim()) } }, select: { id: true, employeeId: true } });
  const byId = new Map(users.map((u) => [u.employeeId!.toLowerCase(), u.id]));
  const errors: string[] = [];
  const ready: { userId: string; p: number; schedule: ReturnType<typeof buildSchedule>; r: OpeningRow }[] = [];
  rows.forEach((r, i) => {
    const userId = byId.get(r.employeeId.trim().toLowerCase());
    const each = Math.round(Number(r.installment) || 0);
    const p = Math.round(Number(r.remaining) || 0);
    // Angsuran per bulan tetap (seperti aplikasi lama): jumlah angsuran mengikuti, sisanya di angsuran terakhir.
    const tm = each > 0 ? terms(p, Math.ceil(p / each - 1e-9), r.startPeriod) : terms(r.remaining, r.tenor, r.startPeriod);
    if (!userId) errors.push(`Baris ${i + 2}: Employee ID ${r.employeeId} tidak ditemukan`);
    else if (each > 0 && each < 1000) errors.push(`Baris ${i + 2}: Angsuran per bulan minimal 1.000`);
    else if ("error" in tm) errors.push(`Baris ${i + 2}: ${tm.error}`);
    else ready.push({ userId, p: tm.p, r, schedule: each > 0 ? buildScheduleByAmount(tm.p, each, r.startPeriod) : buildSchedule(tm.p, tm.n, r.startPeriod) });
  });
  if (errors.length) return { error: "Ada baris yang belum benar; tidak ada yang disimpan.", errors };
  for (const x of ready) {
    await prisma.employeeLoan.create({
      data: {
        userId: x.userId, seqNo: await nextLoanNo(x.userId), principal: x.p, tenor: x.schedule.length, startPeriod: x.r.startPeriod,
        purpose: x.r.note.trim() || "Saldo awal migrasi", status: "BERJALAN", isOpening: true,
        originalAmount: Number(x.r.original) > 0 ? Number(x.r.original) : null,
        createdBy: access.name ?? null, approvedBy: access.name ?? null, approvedAt: new Date(),
        installments: { create: x.schedule },
      },
    });
  }
  refresh();
  return { count: ready.length };
}
