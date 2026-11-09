-- Onboarding calon karyawan.
CREATE TABLE "Candidate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DIUNDANG',
    "data" JSONB,
    "job" JSONB,
    "note" TEXT,
    "otpCode" TEXT,
    "otpExpires" TIMESTAMP(3),
    "otpTries" INTEGER NOT NULL DEFAULT 0,
    "submittedAt" TIMESTAMP(3),
    "invitedBy" TEXT,
    "reviewedBy" TEXT,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Candidate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Candidate_email_key" ON "Candidate"("email");
CREATE UNIQUE INDEX "Candidate_userId_key" ON "Candidate"("userId");
CREATE INDEX "Candidate_status_idx" ON "Candidate"("status");
