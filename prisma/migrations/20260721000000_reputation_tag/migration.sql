-- CreateEnum
CREATE TYPE "ReputationDimension" AS ENUM ('pontualidade', 'educacao', 'compromisso', 'respeito');

-- CreateTable
CREATE TABLE "ReputationTag" (
    "id" UUID NOT NULL,
    "matchId" UUID NOT NULL,
    "voterPlayerId" UUID NOT NULL,
    "votedPlayerId" UUID NOT NULL,
    "dimension" "ReputationDimension" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReputationTag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReputationTag_votedPlayerId_idx" ON "ReputationTag"("votedPlayerId");

-- CreateIndex
CREATE INDEX "ReputationTag_matchId_idx" ON "ReputationTag"("matchId");

-- CreateIndex
CREATE UNIQUE INDEX "ReputationTag_matchId_voterPlayerId_votedPlayerId_dimension_key" ON "ReputationTag"("matchId", "voterPlayerId", "votedPlayerId", "dimension");

-- AddForeignKey
ALTER TABLE "ReputationTag" ADD CONSTRAINT "ReputationTag_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReputationTag" ADD CONSTRAINT "ReputationTag_voterPlayerId_fkey" FOREIGN KEY ("voterPlayerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReputationTag" ADD CONSTRAINT "ReputationTag_votedPlayerId_fkey" FOREIGN KEY ("votedPlayerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
