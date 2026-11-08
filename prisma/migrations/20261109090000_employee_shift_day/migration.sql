-- CreateTable
CREATE TABLE "EmployeeShiftDay" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "shiftId" TEXT NOT NULL,
    "note" TEXT,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeShiftDay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmployeeShiftDay_date_idx" ON "EmployeeShiftDay"("date");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeShiftDay_userId_date_key" ON "EmployeeShiftDay"("userId", "date");

-- AddForeignKey
ALTER TABLE "EmployeeShiftDay" ADD CONSTRAINT "EmployeeShiftDay_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeShiftDay" ADD CONSTRAINT "EmployeeShiftDay_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "WorkShift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

