-- CreateEnum
CREATE TYPE "Foot" AS ENUM ('left', 'right', 'both');

-- AlterTable (card fields — all nullable, descriptive)
ALTER TABLE "Player"
  ADD COLUMN "dominantFoot" "Foot",
  ADD COLUMN "weakFoot" INTEGER,
  ADD COLUMN "skillMoves" INTEGER,
  ADD COLUMN "heightCm" INTEGER,
  ADD COLUMN "weightKg" INTEGER,
  ADD COLUMN "birthYear" INTEGER,
  ADD COLUMN "preferredTeam" TEXT,
  ADD COLUMN "nationality" TEXT;

-- Reset legacy attributes/skills to fresh baseline (catalog changed to 35 subs + new playstyles).
UPDATE "Player" SET "attributes" = '{}'::jsonb, "skills" = ARRAY[]::TEXT[];
