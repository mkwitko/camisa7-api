-- AlterTable
ALTER TABLE "User" ADD COLUMN     "expoPushToken" TEXT,
ADD COLUMN     "googleSub" TEXT,
ADD COLUMN     "passwordHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_googleSub_key" ON "User"("googleSub");
