-- AlterTable
ALTER TABLE "PayComponent" ADD COLUMN "params" JSONB,
ADD COLUMN "baseCodes" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "SalaryComponent" ADD COLUMN "code" TEXT;

-- Koefisien awal sesuai ketentuan (PP 35/2021 lembur, Permenaker 6/2016 THR).
UPDATE "PayComponent" SET "params" = '{"divisor":173,"workday":[1.5,2],"rest6":[2,3,4],"rest5":[2,3,4]}'::jsonb WHERE "code" = 'LBR';
UPDATE "PayComponent" SET "params" = '{"months":1}'::jsonb WHERE "code" = 'THR';

-- Tunjangan karyawan bernama "jabatan" ditautkan ke komponen TJ.
UPDATE "SalaryComponent" SET "code" = 'TJ' WHERE "type" = 'TUNJANGAN' AND lower("name") LIKE '%jabatan%';
