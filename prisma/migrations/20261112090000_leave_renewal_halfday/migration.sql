-- Setup Leave: jatah diperbarui (ulang tahun kerja / 1 Januari), batas sisa bawaan, cuti setengah hari.
ALTER TABLE "LeavePolicy" ADD COLUMN "renewal" TEXT NOT NULL DEFAULT 'ULANG_TAHUN_KERJA',
ADD COLUMN "carryOverExpires" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "carryOverExpiry" TEXT,
ADD COLUMN "allowHalfDay" BOOLEAN NOT NULL DEFAULT false;

-- Pengajuan cuti: jumlah hari bisa 0,5; bagian setengah hari; bagian di luar tanggungan.
ALTER TABLE "LeaveRequest" ALTER COLUMN "totalDays" SET DATA TYPE DOUBLE PRECISION,
ADD COLUMN "halfDay" TEXT,
ADD COLUMN "unpaidDays" DOUBLE PRECISION NOT NULL DEFAULT 0;
