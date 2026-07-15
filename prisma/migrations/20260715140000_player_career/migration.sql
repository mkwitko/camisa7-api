-- CreateEnum
CREATE TYPE "PlayerLevel" AS ENUM ('bronze', 'prata', 'ouro');

-- CreateTable
CREATE TABLE "PlayerCareer" (
    "id" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "overall" JSONB NOT NULL DEFAULT '{}',
    "affinity" JSONB NOT NULL DEFAULT '{}',
    "level" "PlayerLevel" NOT NULL DEFAULT 'bronze',
    "matchesPlayed" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "draws" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "goals" INTEGER NOT NULL DEFAULT 0,
    "assists" INTEGER NOT NULL DEFAULT 0,
    "cleanSheets" INTEGER NOT NULL DEFAULT 0,
    "mvpCount" INTEGER NOT NULL DEFAULT 0,
    "currentStreak" INTEGER NOT NULL DEFAULT 0,
    "bestStreak" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PlayerCareer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlayerCareer_playerId_key" ON "PlayerCareer"("playerId");

-- AddForeignKey
ALTER TABLE "PlayerCareer" ADD CONSTRAINT "PlayerCareer_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

