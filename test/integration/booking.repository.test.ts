import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createBookingRepository } from "../../src/http/api/bookings/booking.repository";
import { startTestDb, type TestDb } from "./helpers/db";

/** 2026-07-20 — arbitrary fixed date, no weekday/price-rule semantics involved here. */
const DATE = "2026-07-20";

describe("bookingRepository (integration)", () => {
  let testDb: TestDb;
  let repo: ReturnType<typeof createBookingRepository>;
  let courtId: string;
  let bookedById: string;

  beforeAll(async () => {
    testDb = await startTestDb();
    repo = createBookingRepository(testDb.prisma);
  }, 60_000);

  afterAll(async () => {
    await testDb.stop();
  });

  beforeEach(async () => {
    await testDb.prisma.$executeRawUnsafe('TRUNCATE TABLE "Venue", "User" CASCADE');

    const owner = await testDb.prisma.user.create({
      data: { email: "owner@b.com", name: "Owner" },
    });
    const venue = await testDb.prisma.venue.create({
      data: {
        ownerId: owner.id,
        name: "Arena Central",
        latitude: -23.5,
        longitude: -46.6,
        address: "Rua do Futebol, 100",
        city: "São Paulo",
      },
    });
    const court = await testDb.prisma.court.create({
      data: { venueId: venue.id, name: "Quadra 1", modality: "futsal" },
    });
    const booker = await testDb.prisma.user.create({
      data: { email: "booker@b.com", name: "Booker" },
    });
    courtId = court.id;
    bookedById = booker.id;
  });

  /**
   * The real double-booking guard: `Booking_slot_active_uniq` (partial
   * unique index on `courtId,date,startMinute` WHERE status is active).
   * The e2e double-book test (`bookings.e2e.test.ts`) hits the service's
   * pre-check first and never reaches this repository catch — this test
   * exercises the P2002 → `SLOT_UNAVAILABLE` mapping directly.
   */
  it("surfaces a second insert for the same active slot as BKG-T0002 (Prisma P2002)", async () => {
    await repo.insert({
      courtId,
      bookedById,
      date: DATE,
      startMinute: 600,
      endMinute: 660,
      priceCents: 10000,
      mode: "instant",
      status: "pending_payment",
    });

    await expect(
      repo.insert({
        courtId,
        bookedById,
        date: DATE,
        startMinute: 600,
        endMinute: 660,
        priceCents: 10000,
        mode: "instant",
        status: "pending_payment",
      }),
    ).rejects.toMatchObject({ code: "BKG-T0002" });
  });

  it("allows re-booking the same slot once the first booking is no longer active", async () => {
    const first = await repo.insert({
      courtId,
      bookedById,
      date: DATE,
      startMinute: 600,
      endMinute: 660,
      priceCents: 10000,
      mode: "instant",
      status: "pending_payment",
    });
    await repo.setStatus(first.id, "cancelled");

    const second = await repo.insert({
      courtId,
      bookedById,
      date: DATE,
      startMinute: 600,
      endMinute: 660,
      priceCents: 10000,
      mode: "instant",
      status: "pending_payment",
    });

    expect(second.id).not.toBe(first.id);
    expect(second).toMatchObject({ courtId, date: DATE, startMinute: 600, status: "pending_payment" });
  });
});
