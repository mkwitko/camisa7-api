-- CreateEnum
CREATE TYPE "MatchStatSource" AS ENUM ('organizador', 'colaborativo');

-- CreateTable
CREATE TABLE "MatchStat" (
    "id" UUID NOT NULL,
    "matchId" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "team" INTEGER,
    "goals" INTEGER NOT NULL DEFAULT 0,
    "assists" INTEGER NOT NULL DEFAULT 0,
    "ownGoals" INTEGER NOT NULL DEFAULT 0,
    "cleanSheet" BOOLEAN NOT NULL DEFAULT false,
    "source" "MatchStatSource" NOT NULL DEFAULT 'organizador',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MatchStat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MatchStat_playerId_idx" ON "MatchStat"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchStat_matchId_playerId_key" ON "MatchStat"("matchId", "playerId");

-- AddForeignKey
ALTER TABLE "MatchStat" ADD CONSTRAINT "MatchStat_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchStat" ADD CONSTRAINT "MatchStat_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

