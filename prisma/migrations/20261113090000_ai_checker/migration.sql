-- CreateTable
CREATE TABLE "AiRun" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'MENUNGGU',
    "trigger" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "batchId" TEXT,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "findingCount" INTEGER NOT NULL DEFAULT 0,
    "summary" TEXT,
    "error" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    CONSTRAINT "AiRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiFinding" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "employeeIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "fingerprint" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'BARU',
    "reason" TEXT,
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiNote" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AKTIF',
    "source" TEXT NOT NULL,
    "createdBy" TEXT,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AiNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiRun_status_idx" ON "AiRun"("status");
CREATE INDEX "AiFinding_status_idx" ON "AiFinding"("status");
CREATE INDEX "AiFinding_fingerprint_idx" ON "AiFinding"("fingerprint");
CREATE INDEX "AiNote_kind_status_idx" ON "AiNote"("kind", "status");

-- AddForeignKey
ALTER TABLE "AiFinding" ADD CONSTRAINT "AiFinding_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AiRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
