import type { EmployeeLoan, LoanInstallment } from "@prisma/client";
import type { LoanView } from "@/components/portal/LoanCard";

// Data pinjaman dari database ke bentuk yang dikirim ke halaman.
export const toLoanView = (l: EmployeeLoan & { installments: LoanInstallment[] }): LoanView => ({
  id: l.id, principal: l.principal, tenor: l.tenor, startPeriod: l.startPeriod, purpose: l.purpose, status: l.status,
  isOpening: l.isOpening, originalAmount: l.originalAmount, note: l.note, createdAt: l.createdAt.toISOString(), approvedBy: l.approvedBy,
  installments: [...l.installments].sort((a, b) => a.seq - b.seq).map((i) => ({
    id: i.id, seq: i.seq, period: i.period, amount: i.amount, status: i.status, paidAt: i.paidAt?.toISOString() ?? null,
  })),
});
