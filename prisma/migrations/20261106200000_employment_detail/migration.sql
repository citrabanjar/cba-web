-- AlterTable
ALTER TABLE "User" ADD COLUMN     "spkDate" DATE,
ADD COLUMN     "spkNumber" TEXT;

-- CreateTable
CREATE TABLE "EmploymentEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "effectiveDate" DATE NOT NULL,
    "contractEndDate" DATE,
    "spkNumber" TEXT,
    "spkDate" DATE,
    "reason" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmploymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmploymentEvent_userId_effectiveDate_idx" ON "EmploymentEvent"("userId", "effectiveDate");

-- AddForeignKey
ALTER TABLE "EmploymentEvent" ADD CONSTRAINT "EmploymentEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
