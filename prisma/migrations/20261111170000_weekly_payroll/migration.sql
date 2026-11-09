-- Payroll mingguan: karyawan harian (gaji harian x pengali = gaji bulanan untuk dasar lembur/BPJS/THR).
ALTER TABLE "EmployeeSalary" ADD COLUMN "dailyWage" DOUBLE PRECISION;
ALTER TABLE "EmployeeSalary" ADD COLUMN "monthlyFactor" DOUBLE PRECISION;
ALTER TABLE "PayrollRun" ADD COLUMN "frequency" TEXT NOT NULL DEFAULT 'BULANAN';
