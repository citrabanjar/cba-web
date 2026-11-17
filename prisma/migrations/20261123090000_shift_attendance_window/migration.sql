-- Batas jam absen dipindah dari Aturan Kehadiran ke tiap shift (kosong = tanpa batas).
ALTER TABLE "WorkShift" ALTER COLUMN "checkInEarliest" DROP NOT NULL, ALTER COLUMN "checkInEarliest" DROP DEFAULT;
ALTER TABLE "WorkShift" ALTER COLUMN "checkOutLatest" DROP NOT NULL, ALTER COLUMN "checkOutLatest" DROP DEFAULT;
-- Nilai lama di shift tidak pernah dipakai; isi dari batas umum Aturan Kehadiran (bila pernah diisi).
UPDATE "WorkShift" SET
  "checkInEarliest" = (SELECT "checkInOpenMinutes" FROM "AttendanceRule" WHERE "id" = 'default'),
  "checkOutLatest" = (SELECT "checkOutCloseMinutes" FROM "AttendanceRule" WHERE "id" = 'default');
