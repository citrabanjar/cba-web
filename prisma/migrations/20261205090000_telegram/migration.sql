-- Telegram bot (opsional): chat karyawan yang terhubung + kode tautan sekali pakai.
ALTER TABLE "User" ADD COLUMN "telegramChatId" TEXT;
ALTER TABLE "User" ADD COLUMN "telegramLinkCode" TEXT;
ALTER TABLE "User" ADD COLUMN "telegramLinkExpires" TIMESTAMP(3);
CREATE UNIQUE INDEX "User_telegramChatId_key" ON "User"("telegramChatId");
CREATE UNIQUE INDEX "User_telegramLinkCode_key" ON "User"("telegramLinkCode");
