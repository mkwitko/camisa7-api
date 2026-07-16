-- CreateEnum
CREATE TYPE "BillingMode" AS ENUM ('mensalista', 'avulso');

-- CreateEnum
CREATE TYPE "DueStatus" AS ENUM ('pending', 'paid');

-- CreateEnum
CREATE TYPE "DueProvider" AS ENUM ('manual', 'stripe');

-- AlterTable
ALTER TABLE "Group" ADD COLUMN     "monthlyFeeCents" INTEGER;

-- AlterTable
ALTER TABLE "GroupMember" ADD COLUMN     "billingMode" "BillingMode" NOT NULL DEFAULT 'avulso',
ADD COLUMN     "monthlyFeeCentsOverride" INTEGER;

-- CreateTable
CREATE TABLE "MembershipDue" (
    "id" UUID NOT NULL,
    "groupMemberId" UUID NOT NULL,
    "competencyMonth" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "status" "DueStatus" NOT NULL DEFAULT 'pending',
    "paidConfirmedById" UUID,
    "provider" "DueProvider" NOT NULL DEFAULT 'manual',
    "externalRef" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MembershipDue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MembershipDue_groupMemberId_idx" ON "MembershipDue"("groupMemberId");

-- CreateIndex
CREATE UNIQUE INDEX "MembershipDue_groupMemberId_competencyMonth_key" ON "MembershipDue"("groupMemberId", "competencyMonth");

-- AddForeignKey
ALTER TABLE "MembershipDue" ADD CONSTRAINT "MembershipDue_groupMemberId_fkey" FOREIGN KEY ("groupMemberId") REFERENCES "GroupMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

