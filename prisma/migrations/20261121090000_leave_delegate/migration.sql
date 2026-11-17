-- Delegasi tanggung jawab saat cuti & pengajuan tidak masuk mendadak.
ALTER TABLE "LeaveRequest" ADD COLUMN "delegateId" TEXT;
ALTER TABLE "LeaveRequest" ADD COLUMN "delegateName" TEXT;
ALTER TABLE "LeaveRequest" ADD COLUMN "urgent" BOOLEAN NOT NULL DEFAULT false;
