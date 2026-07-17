-- Marketplace V1 (hand-written, Prisma 7 convention — see plan
-- 2026-07-17-marketplace-v1.md M1a). Adds account types (`Role` enum +
-- `User.roles`), the `Venue` entity, and `Match.venueId` (a match may point at
-- a venue; the create-match service copies the venue's coords/city/address).

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('jogador', 'organizador', 'quadra');

-- AlterTable: account types (multi), default [jogador] for every existing row.
ALTER TABLE "User" ADD COLUMN "roles" "Role"[] NOT NULL DEFAULT ARRAY['jogador']::"Role"[];

-- CreateTable: Venue
CREATE TABLE "Venue" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "amenities" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "phone" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Venue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Venue_ownerId_idx" ON "Venue"("ownerId");

-- AddForeignKey
ALTER TABLE "Venue" ADD CONSTRAINT "Venue_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: Match.venueId (nullable FK to Venue)
ALTER TABLE "Match" ADD COLUMN "venueId" UUID;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE SET NULL ON UPDATE CASCADE;
