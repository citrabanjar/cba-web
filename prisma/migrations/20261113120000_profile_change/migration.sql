-- CreateTable
CREATE TABLE "ProfileChangeRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "changes" JSONB NOT NULL,
    "family" JSONB,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProfileChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProfileChangeRequest_userId_idx" ON "ProfileChangeRequest"("userId");
CREATE INDEX "ProfileChangeRequest_status_idx" ON "ProfileChangeRequest"("status");

-- AddForeignKey
ALTER TABLE "ProfileChangeRequest" ADD CONSTRAINT "ProfileChangeRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
