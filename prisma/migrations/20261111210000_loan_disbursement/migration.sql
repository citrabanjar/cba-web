-- Pinjaman: nomor urut per karyawan (pinjaman ke-), status DISETUJUI, dan pencairan manual.
ALTER TABLE "EmployeeLoan" ADD COLUMN "seqNo" INTEGER;
ALTER TABLE "EmployeeLoan" ADD COLUMN "disbursedAt" DATE;
ALTER TABLE "EmployeeLoan" ADD COLUMN "disbursedBy" TEXT;
UPDATE "EmployeeLoan" l SET "seqNo" = x.n
FROM (SELECT "id", row_number() OVER (PARTITION BY "userId" ORDER BY "createdAt") AS n FROM "EmployeeLoan") x
WHERE x."id" = l."id";
-- Pinjaman yang sudah berjalan dianggap sudah dicairkan pada tanggal disetujui.
UPDATE "EmployeeLoan" SET "disbursedAt" = COALESCE("approvedAt", "createdAt")::date WHERE "status" IN ('BERJALAN', 'LUNAS');
