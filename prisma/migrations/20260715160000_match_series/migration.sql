-- CreateEnum
CREATE TYPE "SeriesStatus" AS ENUM ('active', 'paused', 'ended');

-- CreateTable
CREATE TABLE "MatchSeries" (
    "id" UUID NOT NULL,
    "groupId" UUID NOT NULL,
    "rule" JSONB NOT NULL,
    "time" TEXT,
    "location" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL DEFAULT 0,
    "slots" INTEGER NOT NULL,
    "pixKey" TEXT,
    "status" "SeriesStatus" NOT NULL DEFAULT 'active',
    "startDate" TIMESTAMPTZ(3) NOT NULL,
    "endDate" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MatchSeries_pkey" PRIMARY KEY ("id")
);

-- Backfill: cada match com recurrenceRule vira uma MatchSeries weekly.
-- Roda ANTES do DROP COLUMN "recurrenceRule" abaixo, enquanto a coluna
-- ainda existe em "Match". No-op seguro se não houver matches com
-- recurrenceRule (ex.: prod vazio). Não popula Match.seriesId — este task
-- só cria a MatchSeries; religar o Match de origem à série fica fora de
-- escopo (ver task brief).
INSERT INTO "MatchSeries" (id, "groupId", rule, time, location, "priceCents", slots, "pixKey", status, "startDate", "createdAt", "updatedAt")
SELECT gen_random_uuid(), m."groupId",
  jsonb_build_object('kind','weekly','weekdays', jsonb_build_array((m."recurrenceRule"->>'weekday')::int), 'interval', 1),
  m."recurrenceRule"->>'time', m.location, m."priceCents", m.slots, m."pixKey",
  'active', m.datetime, now(), now()
FROM "Match" m WHERE m."recurrenceRule" IS NOT NULL;

-- AlterTable
ALTER TABLE "Match" DROP COLUMN "recurrenceRule",
ADD COLUMN     "detached" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "seriesId" UUID;

-- CreateIndex
CREATE INDEX "MatchSeries_groupId_idx" ON "MatchSeries"("groupId");

-- CreateIndex
CREATE INDEX "MatchSeries_status_idx" ON "MatchSeries"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Match_seriesId_datetime_key" ON "Match"("seriesId", "datetime");

-- AddForeignKey
ALTER TABLE "MatchSeries" ADD CONSTRAINT "MatchSeries_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "MatchSeries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
