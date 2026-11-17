-- Cek fisik lembur oleh security dan laporan ke atasan.
-- AlterTable
ALTER TABLE "Overtime" ADD COLUMN     "checkerIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "verifyAt" TIMESTAMP(3),
ADD COLUMN     "verifyBy" TEXT,
ADD COLUMN     "verifyNote" TEXT,
ADD COLUMN     "verifyStatus" TEXT;

-- CreateTable
CREATE TABLE "OvertimeCheck" (
    "id" TEXT NOT NULL,
    "overtimeId" TEXT NOT NULL,
    "checkerId" TEXT NOT NULL,
    "checkerName" TEXT NOT NULL,
    "present" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OvertimeCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OvertimeCheck_overtimeId_idx" ON "OvertimeCheck"("overtimeId");

-- AddForeignKey
ALTER TABLE "OvertimeCheck" ADD CONSTRAINT "OvertimeCheck_overtimeId_fkey" FOREIGN KEY ("overtimeId") REFERENCES "Overtime"("id") ON DELETE CASCADE ON UPDATE CASCADE;

