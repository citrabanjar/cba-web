-- CreateTable
CREATE TABLE "EmployeeEditRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "requesterName" TEXT NOT NULL,
    "approverId" TEXT NOT NULL,
    "approverName" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "summary" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeEditRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmployeeEditRequest_status_idx" ON "EmployeeEditRequest"("status");

-- CreateIndex
CREATE INDEX "EmployeeEditRequest_approverId_idx" ON "EmployeeEditRequest"("approverId");

-- AddForeignKey
ALTER TABLE "EmployeeEditRequest" ADD CONSTRAINT "EmployeeEditRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
