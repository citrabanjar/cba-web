-- AlterTable
ALTER TABLE "PayComponent" ADD COLUMN "param" TEXT;

-- CreateTable
CREATE TABLE "EmployeePayComponent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeePayComponent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EmployeePayComponent_componentId_idx" ON "EmployeePayComponent"("componentId");
CREATE UNIQUE INDEX "EmployeePayComponent_userId_componentId_key" ON "EmployeePayComponent"("userId", "componentId");
ALTER TABLE "EmployeePayComponent" ADD CONSTRAINT "EmployeePayComponent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeePayComponent" ADD CONSTRAINT "EmployeePayComponent_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "PayComponent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Komponen = Input (nilai diisi) atau Rumus (cara hitung + parameter). Pemetaan dari cara hitung lama.
UPDATE "PayComponent" SET "method" = 'INPUT' WHERE "method" = 'TETAP';
UPDATE "PayComponent" SET "method" = 'NOMINAL' WHERE "method" = 'NOMINAL_BULANAN';
UPDATE "PayComponent" SET "method" = 'PER_SATUAN', "param" = 'HARI_HADIR' WHERE "method" = 'PER_HADIR';
UPDATE "PayComponent" SET "method" = 'KELIPATAN', "param" = 'JAM_LEMBUR', "params" = COALESCE("params", '{}'::jsonb) || jsonb_build_object('min', COALESCE("rate", 4)) WHERE "method" = 'PER_LEMBUR';
UPDATE "PayComponent" SET "method" = 'LEMBUR', "param" = 'JAM_LEMBUR' WHERE "method" = 'RUMUS_LEMBUR';
UPDATE "PayComponent" SET "method" = 'THR', "param" = 'MASA_KERJA' WHERE "method" = 'RUMUS_THR';
UPDATE "PayComponent" SET "method" = 'PPH21' WHERE "method" = 'PPH21_TER';
UPDATE "PayComponent" SET "method" = 'PRORATA', "param" = 'HARI_MANGKIR' WHERE "method" = 'PRORATA_MANGKIR';
-- Bonus dan kasbon diisi tiap periode di Proses Gaji.
UPDATE "PayComponent" SET "params" = COALESCE("params", '{}'::jsonb) || '{"perPeriod":true}'::jsonb WHERE "code" IN ('BNS', 'KSB');

-- Contoh rumus dari pemilik: uang saku dinas Rp100.000 per kegiatan dinas luar (SOP CBA).
UPDATE "PayComponent" SET "sortOrder" = "sortOrder" + 1 WHERE "sortOrder" >= 6;
INSERT INTO "PayComponent" ("id","code","name","kind","category","method","param","amount","rate","base","capAmount","floorAmount","params","baseCodes","taxable","legalBasis","note","isActive","sortOrder","updatedBy","createdAt","updatedAt")
VALUES (gen_random_uuid()::text, 'USD', 'Uang Saku Dinas', 'PENDAPATAN', 'TUNJANGAN_TIDAK_TETAP', 'PER_SATUAN', 'KALI_DINAS', 100000, NULL, NULL, NULL, NULL, NULL, ARRAY[]::TEXT[], true,
'Kebijakan perusahaan (SOP dinas CBA)', 'Rp100.000 per kegiatan dinas luar yang disetujui dan dimulai di dalam periode.', true, 6, 'Sistem', now(), now())
ON CONFLICT ("code") DO NOTHING;

-- Awal: semua komponen aktif ditempel ke semua karyawan aktif (sama dengan perilaku sebelumnya).
INSERT INTO "EmployeePayComponent" ("id","userId","componentId","createdBy","createdAt")
SELECT gen_random_uuid()::text, u."id", c."id", 'Sistem', now()
FROM "User" u CROSS JOIN "PayComponent" c
WHERE u."isActive" = true AND u."role" <> 'SUPER_ADMIN' AND c."isActive" = true
ON CONFLICT ("userId", "componentId") DO NOTHING;
