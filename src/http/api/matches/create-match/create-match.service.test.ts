import { describe, expect, it, vi } from "vitest";
import type { BookingRepository } from "@/http/api/bookings/booking.repository";
import type { Booking } from "@/http/api/bookings/booking.types";
import type { CourtRepository } from "@/http/api/courts/court.repository";
import type { CourtWithVenue } from "@/http/api/courts/court.types";
import type { GroupsRepository } from "@/http/api/groups/groups.repository";
import type { Group } from "@/http/api/groups/groups.types";
import type { VenueRepository } from "@/http/api/venues/venue.repository";
import type { Venue } from "@/http/api/venues/venue.types";
import type { MatchesRepository } from "../matches.repository";
import { createCreateMatchService } from "./create-match.service";

const OWNER = "owner-1";

const aGroup = (overrides: Partial<Group> = {}): Group => ({
  id: "g1",
  name: "Team A",
  ownerId: OWNER,
  statsMode: "organizador",
  monthlyFeeCents: null,
  isPublic: false,
  joinPolicy: "open",
  createdAt: new Date().toISOString(),
  ...overrides,
});

const aVenue = (overrides: Partial<Venue> = {}): Venue => ({
  id: "v1",
  ownerId: "someone-else",
  name: "Arena X",
  latitude: -23.5,
  longitude: -46.6,
  address: "Rua do Futebol, 100",
  city: "São Paulo",
  amenities: ["gramado"],
  phone: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

function makeGroupsRepo(group: Group | null): GroupsRepository {
  return {
    insert: vi.fn(),
    findById: vi.fn().mockResolvedValue(group),
    update: vi.fn(),
    listOwnedBy: vi.fn(),
    listOwnedByWithMeta: vi.fn(),
  };
}

function makeVenueRepo(venue: Venue | null): VenueRepository {
  return {
    insert: vi.fn(),
    findById: vi.fn().mockResolvedValue(venue),
    update: vi.fn(),
    listByOwner: vi.fn(),
  };
}

const aBooking = (overrides: Partial<Booking> = {}): Booking => ({
  id: "b1",
  courtId: "c1",
  bookedById: "booker-1",
  date: "2026-08-10",
  startMinute: 600,
  endMinute: 660,
  priceCents: 10000,
  mode: "instant",
  status: "confirmed",
  depositCents: null,
  stripePaymentIntentId: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

function makeBookingRepo(booking: Booking | null): BookingRepository {
  return {
    insert: vi.fn(),
    findById: vi.fn().mockResolvedValue(booking),
    findByPaymentIntentId: vi.fn(),
    listByBooker: vi.fn(),
    listByVenueRange: vi.fn(),
    setStatus: vi.fn(),
    transitionStatus: vi.fn(),
    setPaymentIntent: vi.fn(),
    activeSlotsFor: vi.fn(),
    expireStale: vi.fn(),
  };
}

const aCourtWithVenue = (overrides: Partial<CourtWithVenue> = {}): CourtWithVenue => ({
  id: "c1",
  venueId: "v-from-booking",
  name: "Quadra B",
  modality: "futsal",
  surface: null,
  slotMinutes: 60,
  bookingMode: "instant",
  depositPercent: null,
  active: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  venue: {
    ownerId: "venue-owner-1",
    latitude: -22.9,
    longitude: -43.2,
    city: "Rio de Janeiro",
    address: "Av. das Reservas, 500",
  },
  ...overrides,
});

function makeCourtRepo(court: CourtWithVenue | null): CourtRepository {
  return {
    insert: vi.fn(),
    findById: vi.fn(),
    findByIdWithVenue: vi.fn().mockResolvedValue(court),
    update: vi.fn(),
    listByVenue: vi.fn(),
    replacePriceRules: vi.fn(),
    listPriceRules: vi.fn(),
  };
}

function makeMatchesRepo(): MatchesRepository {
  const insert = vi.fn().mockImplementation(async (input) => ({
    id: "m1",
    groupId: input.groupId,
    seriesId: null,
    detached: false,
    datetime: input.datetime,
    location: input.location,
    priceCents: input.priceCents,
    slots: input.slots,
    pixKey: input.pixKey ?? null,
    status: "open",
    modality: input.modality ?? "campo",
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    city: input.city ?? null,
    address: input.address ?? null,
    venueId: input.venueId ?? null,
    bookingId: input.bookingId ?? null,
    createdAt: new Date().toISOString(),
  }));
  return {
    insert,
    findById: vi.fn(),
    listByGroup: vi.fn(),
    update: vi.fn(),
    setStatus: vi.fn(),
    findFinishedElapsedWithResult: vi.fn(),
    listBySeriesFuture: vi.fn(),
    countFutureBySeries: vi.fn(),
    insertOccurrence: vi.fn(),
    updateFutureNonDetached: vi.fn(),
  } as unknown as MatchesRepository;
}

const baseBody = {
  datetime: "2026-08-01T20:00:00.000Z",
  location: "Quadra Central",
  slots: 20,
  modality: "campo" as const,
  groupId: "g1",
  userId: OWNER,
};

describe("createCreateMatchService", () => {
  it("copies the venue's coords/city/address and links venueId, overriding manual coords", async () => {
    const matchesRepo = makeMatchesRepo();
    const service = createCreateMatchService({
      matchesRepo,
      groupsRepo: makeGroupsRepo(aGroup()),
      venueRepo: makeVenueRepo(aVenue()),
      bookingRepo: makeBookingRepo(null),
      courtRepo: makeCourtRepo(null),
    });

    const match = await service({
      ...baseBody,
      venueId: "v1",
      latitude: 0,
      longitude: 0,
      city: "Manual",
      address: "Manual Addr",
    });

    expect(match).toMatchObject({
      venueId: "v1",
      latitude: -23.5,
      longitude: -46.6,
      city: "São Paulo",
      address: "Rua do Futebol, 100",
    });
  });

  it("rejects with VEN-T0002 when the venueId doesn't exist", async () => {
    const service = createCreateMatchService({
      matchesRepo: makeMatchesRepo(),
      groupsRepo: makeGroupsRepo(aGroup()),
      venueRepo: makeVenueRepo(null),
      bookingRepo: makeBookingRepo(null),
      courtRepo: makeCourtRepo(null),
    });

    await expect(service({ ...baseBody, venueId: "missing" })).rejects.toMatchObject({
      code: "VEN-T0002",
    });
  });

  it("keeps manual coords and null venueId when no venueId is given", async () => {
    const service = createCreateMatchService({
      matchesRepo: makeMatchesRepo(),
      groupsRepo: makeGroupsRepo(aGroup()),
      venueRepo: makeVenueRepo(null),
      bookingRepo: makeBookingRepo(null),
      courtRepo: makeCourtRepo(null),
    });

    const match = await service({ ...baseBody, latitude: -10, longitude: -20, city: "Rio" });

    expect(match).toMatchObject({ venueId: null, latitude: -10, longitude: -20, city: "Rio" });
  });

  it("rejects with MTC-T0005 when creating manually without coords (would be undiscoverable)", async () => {
    const matchesRepo = makeMatchesRepo();
    const service = createCreateMatchService({
      matchesRepo,
      groupsRepo: makeGroupsRepo(aGroup()),
      venueRepo: makeVenueRepo(null),
      bookingRepo: makeBookingRepo(null),
      courtRepo: makeCourtRepo(null),
    });

    // baseBody has no venue/booking and no lat/lng → coords resolve to null.
    await expect(service(baseBody)).rejects.toMatchObject({ code: "MTC-T0005" });
    expect(matchesRepo.insert).not.toHaveBeenCalled();
  });

  describe("bookingId (Marketplace V2)", () => {
    it("copies the booking's court's venue coords and links bookingId, taking precedence over venueId", async () => {
      const matchesRepo = makeMatchesRepo();
      const service = createCreateMatchService({
        matchesRepo,
        groupsRepo: makeGroupsRepo(aGroup()),
        venueRepo: makeVenueRepo(aVenue()),
        bookingRepo: makeBookingRepo(aBooking({ bookedById: OWNER })),
        courtRepo: makeCourtRepo(aCourtWithVenue()),
      });

      const match = await service({
        ...baseBody,
        bookingId: "b1",
        venueId: "v1",
        latitude: 0,
        longitude: 0,
        city: "Manual",
        address: "Manual Addr",
      });

      expect(match).toMatchObject({
        bookingId: "b1",
        venueId: "v-from-booking",
        latitude: -22.9,
        longitude: -43.2,
        city: "Rio de Janeiro",
        address: "Av. das Reservas, 500",
      });
    });

    it("rejects with BKG-T0001 when the bookingId doesn't exist", async () => {
      const service = createCreateMatchService({
        matchesRepo: makeMatchesRepo(),
        groupsRepo: makeGroupsRepo(aGroup()),
        venueRepo: makeVenueRepo(null),
        bookingRepo: makeBookingRepo(null),
        courtRepo: makeCourtRepo(null),
      });

      await expect(service({ ...baseBody, bookingId: "missing" })).rejects.toMatchObject({
        code: "BKG-T0001",
      });
    });

    it("rejects with BKG-T0004 when the booking belongs to another user (IDOR guard)", async () => {
      const service = createCreateMatchService({
        matchesRepo: makeMatchesRepo(),
        groupsRepo: makeGroupsRepo(aGroup()),
        venueRepo: makeVenueRepo(null),
        bookingRepo: makeBookingRepo(aBooking({ bookedById: "someone-else" })),
        courtRepo: makeCourtRepo(aCourtWithVenue()),
      });

      await expect(service({ ...baseBody, bookingId: "b1" })).rejects.toMatchObject({
        code: "BKG-T0004",
      });
    });

    it("links a confirmed booking owned by the caller", async () => {
      const matchesRepo = makeMatchesRepo();
      const service = createCreateMatchService({
        matchesRepo,
        groupsRepo: makeGroupsRepo(aGroup()),
        venueRepo: makeVenueRepo(null),
        bookingRepo: makeBookingRepo(aBooking({ bookedById: OWNER })),
        courtRepo: makeCourtRepo(aCourtWithVenue()),
      });

      const match = await service({ ...baseBody, bookingId: "b1" });

      expect(match).toMatchObject({ bookingId: "b1" });
    });

    it("rejects with BKG-T0005 when the booking isn't confirmed", async () => {
      const service = createCreateMatchService({
        matchesRepo: makeMatchesRepo(),
        groupsRepo: makeGroupsRepo(aGroup()),
        venueRepo: makeVenueRepo(null),
        bookingRepo: makeBookingRepo(aBooking({ bookedById: OWNER, status: "pending_payment" })),
        courtRepo: makeCourtRepo(aCourtWithVenue()),
      });

      await expect(service({ ...baseBody, bookingId: "b1" })).rejects.toMatchObject({
        code: "BKG-T0005",
      });
    });

    it("rejects with BKG-T0005 when the booking is already linked to another match (repo-level double-link guard)", async () => {
      const matchesRepo = makeMatchesRepo();
      (matchesRepo.insert as ReturnType<typeof vi.fn>).mockRejectedValueOnce({ code: "BKG-T0005" });
      const service = createCreateMatchService({
        matchesRepo,
        groupsRepo: makeGroupsRepo(aGroup()),
        venueRepo: makeVenueRepo(null),
        bookingRepo: makeBookingRepo(aBooking({ bookedById: OWNER })),
        courtRepo: makeCourtRepo(aCourtWithVenue()),
      });

      await expect(service({ ...baseBody, bookingId: "b1" })).rejects.toMatchObject({
        code: "BKG-T0005",
      });
    });
  });
});
