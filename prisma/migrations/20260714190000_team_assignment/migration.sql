-- CreateTable
CREATE TABLE "TeamAssignment" (
    "id" UUID NOT NULL,
    "matchId" UUID NOT NULL,
    "teams" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TeamAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TeamAssignment_matchId_key" ON "TeamAssignment"("matchId");

-- AddForeignKey
ALTER TABLE "TeamAssignment" ADD CONSTRAINT "TeamAssignment_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

