-- AlterTable
ALTER TABLE "User" ADD COLUMN     "addressSameAsId" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "currentAddress" TEXT,
ADD COLUMN     "idType" TEXT;

-- Nomor identitas yang sudah ada berasal dari kolom No KTP.
UPDATE "User" SET "idType" = 'KTP' WHERE "ktpNumber" IS NOT NULL;

-- CreateTable
CREATE TABLE "FamilyMember" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "idNumber" TEXT,
    "relation" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FamilyMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FamilyMember_userId_idx" ON "FamilyMember"("userId");

-- AddForeignKey
ALTER TABLE "FamilyMember" ADD CONSTRAINT "FamilyMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
