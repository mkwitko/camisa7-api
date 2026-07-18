import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createBookingRepository } from "../../src/http/api/bookings/booking.repository";
import type { BookingStatus } from "../../src/http/api/bookings/booking.types";
import { createOwner } from "../builders/group.builder";
import { expireStaleBookings } from "../../src/jobs/expire-bookings.job";
import { startTestDb, type TestDb } from "./helpers/db";

const MIN_MS = 60 * 1000;
const HOUR_MS = 60 * MIN_MS;

describe("expireStaleBookings (integration)", () => {
  let testDb: TestDb;
  let bookingRepo: ReturnType<typeof createBookingRepository>;

  beforeAll(async () => {
    testDb = await startTestDb();
    bookingRepo = createBookingRepository(testDb.prisma);
  }, 60_000);

  afterAll(async () => {
    await testDb.stop();
  });

  beforeEach(async () => {
    await testDb.prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "Booking", "Court", "Venue", "User" CASCADE',
    );
  });

  async function seedCourt(): Promise<string> {
    const ownerId = await createOwner(testDb.prisma);
    const venue = await testDb.prisma.venue.create({
      data: {
        ownerId,
        name: "Arena Central",
        latitude: -23.5,
        longitude: -46.6,
        address: "Rua do Futebol, 100",
        city: "São Paulo",
      },
    });
    const court = await testDb.prisma.court.create({
      data: { venueId: venue.id, name: "Quadra 1" },
    });
    return court.id;
  }

  async function seedBooking(
    courtId: string,
    status: BookingStatus,
    createdAt: Date,
    startMinute = 600,
  ): Promise<string> {
    const bookedById = await createOwner(testDb.prisma);
    const booking = await testDb.prisma.booking.create({
      data: {
        courtId,
        bookedById,
        date: new Date("2026-08-10T00:00:00.000Z"),
        startMinute,
        endMinute: startMinute + 60,
        priceCents: 10000,
        mode: "instant",
        status,
        createdAt,
      },
    });
    return booking.id;
  }

  it("expires a pending_payment booking older than 30 minutes", async () => {
    const now = new Date("2026-08-10T12:00:00.000Z");
    const courtId = await seedCourt();
    const bookingId = await seedBooking(
      courtId,
      "pending_payment",
      new Date(now.getTime() - 31 * MIN_MS),
      600,
    );

    const result = await expireStaleBookings(bookingRepo, now);

    expect(result).toEqual({ pendingExpired: 1, requestedExpired: 0 });
    const booking = await bookingRepo.findById(bookingId);
    expect(booking?.status).toBe("expired");
  });

  it("does not touch a pending_payment booking younger than 30 minutes", async () => {
    const now = new Date("2026-08-10T12:00:00.000Z");
    const courtId = await seedCourt();
    const bookingId = await seedBooking(
      courtId,
      "pending_payment",
      new Date(now.getTime() - 10 * MIN_MS),
      600,
    );

    const result = await expireStaleBookings(bookingRepo, now);

    expect(result).toEqual({ pendingExpired: 0, requestedExpired: 0 });
    const booking = await bookingRepo.findById(bookingId);
    expect(booking?.status).toBe("pending_payment");
  });

  it("expires a requested booking older than 24 hours", async () => {
    const now = new Date("2026-08-10T12:00:00.000Z");
    const courtId = await seedCourt();
    const bookingId = await seedBooking(
      courtId,
      "requested",
      new Date(now.getTime() - 25 * HOUR_MS),
      660,
    );

    const result = await expireStaleBookings(bookingRepo, now);

    expect(result).toEqual({ pendingExpired: 0, requestedExpired: 1 });
    const booking = await bookingRepo.findById(bookingId);
    expect(booking?.status).toBe("expired");
  });

  it("does not touch a requested booking younger than 24 hours", async () => {
    const now = new Date("2026-08-10T12:00:00.000Z");
    const courtId = await seedCourt();
    const bookingId = await seedBooking(
      courtId,
      "requested",
      new Date(now.getTime() - 23 * HOUR_MS),
      660,
    );

    const result = await expireStaleBookings(bookingRepo, now);

    expect(result).toEqual({ pendingExpired: 0, requestedExpired: 0 });
    const booking = await bookingRepo.findById(bookingId);
    expect(booking?.status).toBe("requested");
  });

  it("never touches confirmed or cancelled bookings regardless of age", async () => {
    const now = new Date("2026-08-10T12:00:00.000Z");
    const courtId = await seedCourt();
    const veryOld = new Date(now.getTime() - 200 * HOUR_MS);
    const confirmedId = await seedBooking(courtId, "confirmed", veryOld, 600);
    const cancelledId = await seedBooking(courtId, "cancelled", veryOld, 720);

    const result = await expireStaleBookings(bookingRepo, now);

    expect(result).toEqual({ pendingExpired: 0, requestedExpired: 0 });
    expect((await bookingRepo.findById(confirmedId))?.status).toBe("confirmed");
    expect((await bookingRepo.findById(cancelledId))?.status).toBe("cancelled");
  });
});
