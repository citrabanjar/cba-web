-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'SUPER_ADMIN';

-- AlterTable: SUPER_ADMIN bukan karyawan, jadi tidak punya NIK
ALTER TABLE "User" ALTER COLUMN "employeeId" DROP NOT NULL;
