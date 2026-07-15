-- CreateEnum
CREATE TYPE "VoteCategory" AS ENUM ('mvp', 'melhor_goleiro', 'craque', 'fair_play');

-- CreateTable
CREATE TABLE "Vote" (
    "id" UUID NOT NULL,
    "matchId" UUID NOT NULL,
    "voterPlayerId" UUID NOT NULL,
    "category" "VoteCategory" NOT NULL,
    "votedPlayerId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Vote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Vote_matchId_idx" ON "Vote"("matchId");

-- CreateIndex
CREATE INDEX "Vote_votedPlayerId_idx" ON "Vote"("votedPlayerId");

-- CreateIndex
CREATE UNIQUE INDEX "Vote_matchId_voterPlayerId_category_key" ON "Vote"("matchId", "voterPlayerId", "category");

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_voterPlayerId_fkey" FOREIGN KEY ("voterPlayerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_votedPlayerId_fkey" FOREIGN KEY ("votedPlayerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

