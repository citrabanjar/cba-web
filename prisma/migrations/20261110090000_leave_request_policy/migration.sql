-- AlterTable
ALTER TABLE "LeaveRequest" ADD COLUMN "policyId" TEXT;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "LeavePolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;
