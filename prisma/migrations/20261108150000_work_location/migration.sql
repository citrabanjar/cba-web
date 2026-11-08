-- AlterTable
ALTER TABLE "Attendance" ADD COLUMN     "checkInLocation" TEXT,
ADD COLUMN     "checkOutLocation" TEXT;

-- CreateTable
CREATE TABLE "WorkLocation" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "radius" INTEGER NOT NULL DEFAULT 200,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_UserWorkLocations" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_ShiftWorkLocations" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_PatternWorkLocations" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkLocation_name_key" ON "WorkLocation"("name");

-- CreateIndex
CREATE UNIQUE INDEX "_UserWorkLocations_AB_unique" ON "_UserWorkLocations"("A", "B");

-- CreateIndex
CREATE INDEX "_UserWorkLocations_B_index" ON "_UserWorkLocations"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_ShiftWorkLocations_AB_unique" ON "_ShiftWorkLocations"("A", "B");

-- CreateIndex
CREATE INDEX "_ShiftWorkLocations_B_index" ON "_ShiftWorkLocations"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_PatternWorkLocations_AB_unique" ON "_PatternWorkLocations"("A", "B");

-- CreateIndex
CREATE INDEX "_PatternWorkLocations_B_index" ON "_PatternWorkLocations"("B");

-- AddForeignKey
ALTER TABLE "_UserWorkLocations" ADD CONSTRAINT "_UserWorkLocations_A_fkey" FOREIGN KEY ("A") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_UserWorkLocations" ADD CONSTRAINT "_UserWorkLocations_B_fkey" FOREIGN KEY ("B") REFERENCES "WorkLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ShiftWorkLocations" ADD CONSTRAINT "_ShiftWorkLocations_A_fkey" FOREIGN KEY ("A") REFERENCES "WorkLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ShiftWorkLocations" ADD CONSTRAINT "_ShiftWorkLocations_B_fkey" FOREIGN KEY ("B") REFERENCES "WorkShift"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PatternWorkLocations" ADD CONSTRAINT "_PatternWorkLocations_A_fkey" FOREIGN KEY ("A") REFERENCES "WorkLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PatternWorkLocations" ADD CONSTRAINT "_PatternWorkLocations_B_fkey" FOREIGN KEY ("B") REFERENCES "WorkPattern"("id") ON DELETE CASCADE ON UPDATE CASCADE;

