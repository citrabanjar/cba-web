-- CreateTable
CREATE TABLE "MedicalClaim" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "treatDate" DATE NOT NULL,
    "provider" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "payout" DOUBLE PRECISION NOT NULL,
    "percent" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "approval" JSONB,
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decision" TEXT,
    "paidRunId" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MedicalClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicalClaimFile" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MedicalClaimFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MedicalClaim_userId_treatDate_idx" ON "MedicalClaim"("userId", "treatDate");

-- CreateIndex
CREATE INDEX "MedicalClaim_status_idx" ON "MedicalClaim"("status");

-- CreateIndex
CREATE INDEX "MedicalClaimFile_claimId_idx" ON "MedicalClaimFile"("claimId");

-- AddForeignKey
ALTER TABLE "MedicalClaim" ADD CONSTRAINT "MedicalClaim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalClaimFile" ADD CONSTRAINT "MedicalClaimFile_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "MedicalClaim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

