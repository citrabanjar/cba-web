-- CreateTable
CREATE TABLE "LeaveRequestFile" (
    "id" TEXT NOT NULL,
    "leaveId" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaveRequestFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeaveRequestFile_leaveId_idx" ON "LeaveRequestFile"("leaveId");

-- AddForeignKey
ALTER TABLE "LeaveRequestFile" ADD CONSTRAINT "LeaveRequestFile_leaveId_fkey" FOREIGN KEY ("leaveId") REFERENCES "LeaveRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
