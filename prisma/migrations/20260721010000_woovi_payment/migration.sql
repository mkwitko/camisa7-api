-- CreateEnum
CREATE TYPE "PaymentKind" AS ENUM ('match_fee', 'membership_due');

-- CreateEnum
CREATE TYPE "WooviPaymentStatus" AS ENUM ('pending', 'completed', 'expired');

-- AlterTable
ALTER TABLE "Group" ADD COLUMN     "wooviPixKey" TEXT;

-- CreateTable
CREATE TABLE "Payment" (
    "id" UUID NOT NULL,
    "correlationID" TEXT NOT NULL,
    "kind" "PaymentKind" NOT NULL,
    "status" "WooviPaymentStatus" NOT NULL DEFAULT 'pending',
    "valueCents" INTEGER NOT NULL,
    "subaccountPixKey" TEXT NOT NULL,
    "brCode" TEXT NOT NULL,
    "qrCodeImage" TEXT NOT NULL,
    "paymentLinkUrl" TEXT,
    "attendanceId" UUID,
    "membershipDueId" UUID,
    "paidAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Payment_correlationID_key" ON "Payment"("correlationID");

-- CreateIndex
CREATE INDEX "Payment_attendanceId_idx" ON "Payment"("attendanceId");

-- CreateIndex
CREATE INDEX "Payment_membershipDueId_idx" ON "Payment"("membershipDueId");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_attendanceId_fkey" FOREIGN KEY ("attendanceId") REFERENCES "Attendance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_membershipDueId_fkey" FOREIGN KEY ("membershipDueId") REFERENCES "MembershipDue"("id") ON DELETE SET NULL ON UPDATE CASCADE;
