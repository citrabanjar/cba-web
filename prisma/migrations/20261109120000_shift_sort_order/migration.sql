-- AlterTable
ALTER TABLE "WorkShift" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- Urutan awal mengikuti tampilan lama: shift kerja dulu, lalu libur, urut kode.
UPDATE "WorkShift" w SET "sortOrder" = o.rn
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY "isOff" ASC, "code" ASC) AS rn FROM "WorkShift") o
WHERE w.id = o.id;
