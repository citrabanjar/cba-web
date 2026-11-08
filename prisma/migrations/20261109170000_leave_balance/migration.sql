-- AlterTable
ALTER TABLE "LeavePolicy" ADD COLUMN "forStatus" TEXT,
ADD COLUMN "accrualPerMonth" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "LeaveBalanceEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "days" DOUBLE PRECISION NOT NULL,
    "kind" TEXT NOT NULL,
    "note" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaveBalanceEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeaveBalanceEntry_userId_policyId_idx" ON "LeaveBalanceEntry"("userId", "policyId");

-- AddForeignKey
ALTER TABLE "LeaveBalanceEntry" ADD CONSTRAINT "LeaveBalanceEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeaveBalanceEntry" ADD CONSTRAINT "LeaveBalanceEntry_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "LeavePolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Cuti Tahunan khusus karyawan tetap; karyawan kontrak memakai Cuti Masa Kontrak (keputusan pemilik 2026-11-08).
UPDATE "LeavePolicy" SET "forStatus" = 'TETAP' WHERE "code" = 'CT';
UPDATE "LeavePolicy" SET "sortOrder" = "sortOrder" + 1 WHERE "sortOrder" >= 2;
INSERT INTO "LeavePolicy" ("id","code","name","category","quota","unit","period","minServiceMonths","gender","forStatus","accrualPerMonth","paid","payNote","deductsAnnual","needsAttachment","attachmentNote","carryOverDays","noticeDays","legalBasis","note","isActive","sortOrder","updatedBy","createdAt","updatedAt")
VALUES (gen_random_uuid()::text, 'CMK', 'Cuti Masa Kontrak', 'TAHUNAN', NULL, 'HARI_KERJA', 'KEJADIAN', 0, NULL, 'KONTRAK', 1, true, NULL, false, false, NULL, 0, 0,
'Kebijakan perusahaan (pengganti Cuti Tahunan untuk karyawan kontrak)',
'Saldo bertambah 1 hari setiap genap 1 bulan kerja sejak tanggal masuk. Habis kalau karyawan resign; lanjut kalau kontrak diperpanjang.',
true, 2, 'Sistem', now(), now());
