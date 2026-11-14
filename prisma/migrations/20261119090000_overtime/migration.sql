-- CreateTable
CREATE TABLE "OvertimeOrder" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "breakStart" TEXT,
    "breakEnd" TEXT,
    "note" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OvertimeOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Overtime" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orderId" TEXT,
    "date" DATE NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "breakStart" TEXT,
    "breakEnd" TEXT,
    "reason" TEXT,
    "status" TEXT NOT NULL,
    "approval" JSONB,
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "note" TEXT,
    "revisionStatus" TEXT,
    "revisionEnd" TEXT,
    "revisionBy" TEXT,
    "revisionAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Overtime_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OvertimeOrder_number_key" ON "OvertimeOrder"("number");

-- CreateIndex
CREATE INDEX "Overtime_userId_date_idx" ON "Overtime"("userId", "date");

-- CreateIndex
CREATE INDEX "Overtime_status_idx" ON "Overtime"("status");

-- CreateIndex
CREATE INDEX "Overtime_orderId_idx" ON "Overtime"("orderId");

-- AddForeignKey
ALTER TABLE "Overtime" ADD CONSTRAINT "Overtime_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Overtime" ADD CONSTRAINT "Overtime_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "OvertimeOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
