import type { EmployeeLoan, LoanInstallment } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { readLoanFlow } from "@/lib/loans";
import type { LoanView } from "@/components/portal/LoanCard";

// Data pinjaman dari database ke bentuk yang dikirim ke halaman.
export const toLoanView = (l: EmployeeLoan & { installments: LoanInstallment[] }): LoanView => ({
  // Pengajuan ditolak / dibatalkan tidak memakai nomor "Pinjaman ke-".
  id: l.id, seqNo: ["DITOLAK", "BATAL"].includes(l.status) ? 0 : l.seqNo ?? 0, disbursedAt: l.disbursedAt?.toISOString().slice(0, 10) ?? null, principal: l.principal, tenor: l.tenor, startPeriod: l.startPeriod, purpose: l.purpose, status: l.status,
  isOpening: l.isOpening, originalAmount: l.originalAmount, note: l.note, createdAt: l.createdAt.toISOString(), approvedBy: l.approvedBy,
  stage: l.stage, flow: readLoanFlow(l.flow),
  installments: [...l.installments].sort((a, b) => a.seq - b.seq).map((i) => ({
    id: i.id, seq: i.seq, period: i.period, amount: i.amount, status: i.status, paidAt: i.paidAt?.toISOString() ?? null,
  })),
});

// Nomor pinjaman berikutnya untuk karyawan (pinjaman ke-1, ke-2, ...).
export async function nextLoanNo(userId: string) {
  const last = await prisma.employeeLoan.aggregate({ where: { userId, status: { notIn: ["DITOLAK", "BATAL"] } }, _max: { seqNo: true } });
  return (last._max.seqNo ?? 0) + 1;
}
