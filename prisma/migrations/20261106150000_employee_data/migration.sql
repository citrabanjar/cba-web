-- CreateEnum
CREATE TYPE "SalaryComponentType" AS ENUM ('TUNJANGAN', 'POTONGAN');

-- AlterEnum
BEGIN;
CREATE TYPE "UserRole_new" AS ENUM ('KARYAWAN', 'ADMIN', 'SUPER_ADMIN');
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" TYPE "UserRole_new" USING ("role"::text::"UserRole_new");
ALTER TYPE "UserRole" RENAME TO "UserRole_old";
ALTER TYPE "UserRole_new" RENAME TO "UserRole";
DROP TYPE "UserRole_old";
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'KARYAWAN';
COMMIT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "address" TEXT,
ADD COLUMN     "birthDate" DATE,
ADD COLUMN     "birthPlace" TEXT,
ADD COLUMN     "bpjsKesActive" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "bpjsKesNumber" TEXT,
ADD COLUMN     "bpjsTkActive" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "bpjsTkNumber" TEXT,
ADD COLUMN     "branch" TEXT,
ADD COLUMN     "contractEndDate" DATE,
ADD COLUMN     "emergencyName" TEXT,
ADD COLUMN     "emergencyPhone" TEXT,
ADD COLUMN     "emergencyRelation" TEXT,
ADD COLUMN     "employeeNo" INTEGER,
ADD COLUMN     "gender" TEXT,
ADD COLUMN     "ktpNumber" TEXT,
ADD COLUMN     "managerId" TEXT,
ADD COLUMN     "maritalStatus" TEXT,
ADD COLUMN     "menuAccess" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "nationality" TEXT,
ADD COLUMN     "npwp" TEXT,
ADD COLUMN     "paymentSchedule" TEXT,
ADD COLUMN     "ptkpStatus" TEXT,
ADD COLUMN     "religion" TEXT,
ADD COLUMN     "resignDate" DATE,
ADD COLUMN     "taxObjectCode" TEXT,
ADD COLUMN     "taxStatus" TEXT,
ADD COLUMN     "taxability" TEXT;

-- CreateTable
CREATE TABLE "EmployeeSalary" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "effectiveDate" DATE NOT NULL,
    "basicSalary" DOUBLE PRECISION NOT NULL,
    "bpjsTkBase" DOUBLE PRECISION,
    "bpjsKesBase" DOUBLE PRECISION,
    "note" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeSalary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalaryComponent" (
    "id" TEXT NOT NULL,
    "salaryId" TEXT NOT NULL,
    "type" "SalaryComponentType" NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "SalaryComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeChangeLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "changedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeChangeLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeSalary_userId_effectiveDate_key" ON "EmployeeSalary"("userId", "effectiveDate");

-- CreateIndex
CREATE INDEX "SalaryComponent_salaryId_idx" ON "SalaryComponent"("salaryId");

-- CreateIndex
CREATE INDEX "EmployeeChangeLog_userId_createdAt_idx" ON "EmployeeChangeLog"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_employeeNo_key" ON "User"("employeeNo");

-- CreateIndex
CREATE UNIQUE INDEX "User_ktpNumber_key" ON "User"("ktpNumber");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeSalary" ADD CONSTRAINT "EmployeeSalary_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryComponent" ADD CONSTRAINT "SalaryComponent_salaryId_fkey" FOREIGN KEY ("salaryId") REFERENCES "EmployeeSalary"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeChangeLog" ADD CONSTRAINT "EmployeeChangeLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

