-- Tempelan komponen per karyawan punya masa berlaku (mis. tunjangan jabatan berhenti karena demosi).
ALTER TABLE "EmployeePayComponent" ADD COLUMN "startDate" DATE;
ALTER TABLE "EmployeePayComponent" ADD COLUMN "endDate" DATE;
ALTER TABLE "EmployeePayComponent" ADD COLUMN "note" TEXT;
ALTER TABLE "EmployeePayComponent" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
