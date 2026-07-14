-- CreateTable
CREATE TABLE "InviteToken" (
    "id" UUID NOT NULL,
    "matchId" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "InviteToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InviteToken_token_key" ON "InviteToken"("token");

-- CreateIndex
CREATE INDEX "InviteToken_matchId_idx" ON "InviteToken"("matchId");

-- AddForeignKey
ALTER TABLE "InviteToken" ADD CONSTRAINT "InviteToken_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

