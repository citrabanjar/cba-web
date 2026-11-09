-- Pinjaman karyawan (tanpa bunga) dan tabel angsurannya.
CREATE TABLE "EmployeeLoan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "principal" DOUBLE PRECISION NOT NULL,
    "tenor" INTEGER NOT NULL,
    "startPeriod" TEXT NOT NULL,
    "purpose" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "isOpening" BOOLEAN NOT NULL DEFAULT false,
    "originalAmount" DOUBLE PRECISION,
    "note" TEXT,
    "createdBy" TEXT,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EmployeeLoan_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "LoanInstallment" (
    "id" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "period" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'BELUM',
    "paidRunId" TEXT,
    "paidAt" TIMESTAMP(3),
    "note" TEXT,
    CONSTRAINT "LoanInstallment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EmployeeLoan_userId_idx" ON "EmployeeLoan"("userId");
CREATE INDEX "EmployeeLoan_status_idx" ON "EmployeeLoan"("status");
CREATE UNIQUE INDEX "LoanInstallment_loanId_seq_key" ON "LoanInstallment"("loanId", "seq");
CREATE INDEX "LoanInstallment_period_status_idx" ON "LoanInstallment"("period", "status");
ALTER TABLE "EmployeeLoan" ADD CONSTRAINT "EmployeeLoan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LoanInstallment" ADD CONSTRAINT "LoanInstallment_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "EmployeeLoan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
