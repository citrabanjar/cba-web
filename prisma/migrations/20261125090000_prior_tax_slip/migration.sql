-- Bukti potong PPh 21 dari pemberi kerja sebelumnya (karyawan pindahan).
-- CreateTable
CREATE TABLE "PriorTaxSlip" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "employerName" TEXT NOT NULL,
    "employerNpwp" TEXT,
    "slipNumber" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'BPA1',
    "monthFrom" INTEGER NOT NULL,
    "monthTo" INTEGER NOT NULL,
    "gross" DOUBLE PRECISION NOT NULL,
    "net" DOUBLE PRECISION,
    "pph21" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriorTaxSlip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PriorTaxSlip_userId_year_idx" ON "PriorTaxSlip"("userId", "year");

-- AddForeignKey
ALTER TABLE "PriorTaxSlip" ADD CONSTRAINT "PriorTaxSlip_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

