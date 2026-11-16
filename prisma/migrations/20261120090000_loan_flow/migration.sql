-- Alur pengajuan pinjaman: atasan langsung -> pemeriksaan Admin -> keputusan pimpinan puncak.
ALTER TABLE "EmployeeLoan" ADD COLUMN "stage" TEXT;
ALTER TABLE "EmployeeLoan" ADD COLUMN "flow" JSONB;
