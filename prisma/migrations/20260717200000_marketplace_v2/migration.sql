-- Marketplace V2 (hand-written, Prisma 7 convention — see task B1 brief,
-- .superpowers/sdd/briefs/task-B1-brief.md). Adds booking/Connect state:
-- `User.stripeAccountId` (Stripe Express connected account correlation),
-- `Court`/`CourtPriceRule`/`Booking` (booking flow: instant/request/deposit),
-- and `Match.bookingId` (a match may be born from a confirmed booking).
-- The `Booking_slot_active_uniq` partial unique index is the real
-- double-booking guard — Prisma's schema DSL can't express partial
-- uniqueness (same convention as `Attendance`'s `attendance_active_unique`,
-- see 20260714170000_attendance/migration.sql).

CREATE TYPE "BookingMode" AS ENUM ('instant','request','deposit');
CREATE TYPE "BookingStatus" AS ENUM ('requested','pending_payment','confirmed','completed','cancelled','rejected','expired');

ALTER TABLE "User" ADD COLUMN "stripeAccountId" TEXT;

CREATE TABLE "Court" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "venueId" UUID NOT NULL REFERENCES "Venue"("id"),
  "name" TEXT NOT NULL,
  "modality" "Modality" NOT NULL DEFAULT 'campo',
  "surface" TEXT,
  "slotMinutes" INTEGER NOT NULL DEFAULT 60,
  "bookingMode" "BookingMode" NOT NULL DEFAULT 'instant',
  "depositPercent" INTEGER,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL
);
CREATE INDEX "Court_venueId_idx" ON "Court"("venueId");

CREATE TABLE "CourtPriceRule" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "courtId" UUID NOT NULL REFERENCES "Court"("id") ON DELETE CASCADE,
  "weekday" INTEGER NOT NULL,
  "startMinute" INTEGER NOT NULL,
  "endMinute" INTEGER NOT NULL,
  "priceCents" INTEGER NOT NULL
);
CREATE INDEX "CourtPriceRule_courtId_weekday_idx" ON "CourtPriceRule"("courtId","weekday");

CREATE TABLE "Booking" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "courtId" UUID NOT NULL REFERENCES "Court"("id"),
  "bookedById" UUID NOT NULL REFERENCES "User"("id"),
  "date" DATE NOT NULL,
  "startMinute" INTEGER NOT NULL,
  "endMinute" INTEGER NOT NULL,
  "priceCents" INTEGER NOT NULL,
  "mode" "BookingMode" NOT NULL,
  "status" "BookingStatus" NOT NULL DEFAULT 'pending_payment',
  "depositCents" INTEGER,
  "stripePaymentIntentId" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL
);
CREATE INDEX "Booking_courtId_date_idx" ON "Booking"("courtId","date");
CREATE INDEX "Booking_bookedById_idx" ON "Booking"("bookedById");
-- anti double-booking: um slot ativo por court+data+início
CREATE UNIQUE INDEX "Booking_slot_active_uniq" ON "Booking"("courtId","date","startMinute")
  WHERE "status" IN ('requested','pending_payment','confirmed','completed');

ALTER TABLE "Match" ADD COLUMN "bookingId" UUID REFERENCES "Booking"("id");
CREATE UNIQUE INDEX "Match_bookingId_key" ON "Match"("bookingId") WHERE "bookingId" IS NOT NULL;
