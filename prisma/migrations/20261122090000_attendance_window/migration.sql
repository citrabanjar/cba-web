-- Batas jam absen masuk / pulang terhadap jadwal shift.
ALTER TABLE "AttendanceRule" ADD COLUMN "checkInOpenMinutes" INTEGER;
ALTER TABLE "AttendanceRule" ADD COLUMN "checkInCloseMinutes" INTEGER;
ALTER TABLE "AttendanceRule" ADD COLUMN "checkOutCloseMinutes" INTEGER;
