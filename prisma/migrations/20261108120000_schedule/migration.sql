-- CreateEnum
CREATE TYPE "HolidayType" AS ENUM ('NASIONAL', 'CUTI_BERSAMA', 'PERUSAHAAN');

-- CreateTable
CREATE TABLE "WorkShift" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#10b981',
    "isOff" BOOLEAN NOT NULL DEFAULT false,
    "startTime" TEXT,
    "endTime" TEXT,
    "breaks" JSONB NOT NULL DEFAULT '[]',
    "lateTolerance" INTEGER NOT NULL DEFAULT 5,
    "earlyLeaveTolerance" INTEGER NOT NULL DEFAULT 0,
    "checkInEarliest" INTEGER NOT NULL DEFAULT 60,
    "checkOutLatest" INTEGER NOT NULL DEFAULT 360,
    "overtimeStartAfter" INTEGER NOT NULL DEFAULT 30,
    "overtimeMinimum" INTEGER NOT NULL DEFAULT 60,
    "overtimeRounding" INTEGER NOT NULL DEFAULT 30,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkShift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkPattern" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "cycleDays" INTEGER NOT NULL DEFAULT 7,
    "startDate" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkPattern_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkPatternDay" (
    "id" TEXT NOT NULL,
    "patternId" TEXT NOT NULL,
    "dayIndex" INTEGER NOT NULL,
    "shiftId" TEXT NOT NULL,

    CONSTRAINT "WorkPatternDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Holiday" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "type" "HolidayType" NOT NULL DEFAULT 'NASIONAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceRule" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "overtimeNeedsApproval" BOOLEAN NOT NULL DEFAULT true,
    "holidayWorkIsOvertime" BOOLEAN NOT NULL DEFAULT true,
    "halfDayMinutes" INTEGER NOT NULL DEFAULT 240,
    "lateAsHalfDayMinutes" INTEGER,
    "noCheckInIsAlpha" BOOLEAN NOT NULL DEFAULT true,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkShift_code_key" ON "WorkShift"("code");

-- CreateIndex
CREATE UNIQUE INDEX "WorkPattern_name_key" ON "WorkPattern"("name");

-- CreateIndex
CREATE UNIQUE INDEX "WorkPatternDay_patternId_dayIndex_key" ON "WorkPatternDay"("patternId", "dayIndex");

-- CreateIndex
CREATE UNIQUE INDEX "Holiday_date_key" ON "Holiday"("date");

-- AddForeignKey
ALTER TABLE "WorkPatternDay" ADD CONSTRAINT "WorkPatternDay_patternId_fkey" FOREIGN KEY ("patternId") REFERENCES "WorkPattern"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkPatternDay" ADD CONSTRAINT "WorkPatternDay_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "WorkShift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Isi awal: shift Normal, Sabtu setengah hari, OFF; pola 5 dan 6 hari kerja; aturan default.
INSERT INTO "WorkShift" ("id", "code", "name", "color", "isOff", "startTime", "endTime", "breaks", "updatedAt") VALUES
  ('shift_normal', 'N', 'Normal', '#10b981', false, '08:00', '17:00', '[{"start":"12:00","end":"13:00"}]', now()),
  ('shift_sabtu', 'S', 'Sabtu Setengah Hari', '#0ea5e9', false, '08:00', '13:00', '[]', now()),
  ('shift_off', 'OFF', 'Libur', '#9ca3af', true, NULL, NULL, '[]', now());

-- 5 Januari 2026 adalah hari Senin, jadi hari ke-1 siklus = Senin.
INSERT INTO "WorkPattern" ("id", "name", "description", "cycleDays", "startDate", "updatedAt") VALUES
  ('pattern_5hari', '5 Hari Kerja', 'Senin-Jumat Normal, Sabtu-Minggu libur', 7, '2026-01-05', now()),
  ('pattern_6hari', '6 Hari Kerja', 'Senin-Jumat Normal, Sabtu setengah hari, Minggu libur', 7, '2026-01-05', now());

INSERT INTO "WorkPatternDay" ("id", "patternId", "dayIndex", "shiftId") VALUES
  ('p5_0', 'pattern_5hari', 0, 'shift_normal'), ('p5_1', 'pattern_5hari', 1, 'shift_normal'),
  ('p5_2', 'pattern_5hari', 2, 'shift_normal'), ('p5_3', 'pattern_5hari', 3, 'shift_normal'),
  ('p5_4', 'pattern_5hari', 4, 'shift_normal'), ('p5_5', 'pattern_5hari', 5, 'shift_off'),
  ('p5_6', 'pattern_5hari', 6, 'shift_off'),
  ('p6_0', 'pattern_6hari', 0, 'shift_normal'), ('p6_1', 'pattern_6hari', 1, 'shift_normal'),
  ('p6_2', 'pattern_6hari', 2, 'shift_normal'), ('p6_3', 'pattern_6hari', 3, 'shift_normal'),
  ('p6_4', 'pattern_6hari', 4, 'shift_normal'), ('p6_5', 'pattern_6hari', 5, 'shift_sabtu'),
  ('p6_6', 'pattern_6hari', 6, 'shift_off');

INSERT INTO "AttendanceRule" ("id", "updatedAt") VALUES ('default', now());
