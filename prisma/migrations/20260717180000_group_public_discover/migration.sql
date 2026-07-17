-- Geo G3 (descoberta pública + mapa). Hand-written SQL migration (Prisma 7
-- can't run `migrate dev` non-interactively — see plan A1). Applied by
-- `prisma migrate deploy` (Testcontainers + real deploy alike).

-- Radius search (`GET /discover`) uses PostgreSQL's earthdistance functions
-- (`earth_distance`/`ll_to_earth`), which live outside the Prisma client and
-- are called via `$queryRaw`. `earthdistance` depends on `cube`.
CREATE EXTENSION IF NOT EXISTS cube;
CREATE EXTENSION IF NOT EXISTS earthdistance;

-- CreateEnum
CREATE TYPE "JoinPolicy" AS ENUM ('open', 'request');

-- AlterTable
ALTER TABLE "Group"
  ADD COLUMN "isPublic" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "joinPolicy" "JoinPolicy" NOT NULL DEFAULT 'open';
