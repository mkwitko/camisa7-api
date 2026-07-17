-- Geo G3 (Fase 2, descoberta pública): JoinRequest. Hand-written SQL migration
-- (Prisma 7 can't run `migrate dev` non-interactively — see plan A1/B1).
-- Applied by `prisma migrate deploy` (Testcontainers + real deploy alike).

-- CreateEnum
CREATE TYPE "JoinRequestStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateTable
CREATE TABLE "JoinRequest" (
    "id" UUID NOT NULL,
    "matchId" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "status" "JoinRequestStatus" NOT NULL DEFAULT 'pending',
    "decidedById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "JoinRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JoinRequest_matchId_playerId_key" ON "JoinRequest"("matchId", "playerId");

-- CreateIndex
CREATE INDEX "JoinRequest_matchId_idx" ON "JoinRequest"("matchId");

-- AddForeignKey
ALTER TABLE "JoinRequest" ADD CONSTRAINT "JoinRequest_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JoinRequest" ADD CONSTRAINT "JoinRequest_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
