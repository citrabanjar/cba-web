-- CreateTable
CREATE TABLE "Branch" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Position" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Branch_name_key" ON "Branch"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Position_name_key" ON "Position"("name");

-- Isi awal diambil dari data karyawan yang sudah ada.
INSERT INTO "Branch" ("id", "name")
SELECT gen_random_uuid()::text, "branch" FROM (
  SELECT DISTINCT "branch" FROM "User" WHERE "branch" IS NOT NULL AND "branch" <> ''
) AS existing;

INSERT INTO "Position" ("id", "name")
SELECT gen_random_uuid()::text, "position" FROM (
  SELECT DISTINCT "position" FROM "User" WHERE "position" IS NOT NULL AND "position" <> ''
) AS existing;
