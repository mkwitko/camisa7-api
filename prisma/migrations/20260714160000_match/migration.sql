-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('open', 'full', 'closed', 'finished', 'cancelled');

-- CreateTable
CREATE TABLE "Match" (
    "id" UUID NOT NULL,
    "groupId" UUID NOT NULL,
    "datetime" TIMESTAMPTZ(3) NOT NULL,
    "location" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL DEFAULT 0,
    "slots" INTEGER NOT NULL,
    "pixKey" TEXT,
    "status" "MatchStatus" NOT NULL DEFAULT 'open',
    "recurrenceRule" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Match_groupId_datetime_idx" ON "Match"("groupId", "datetime");

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

