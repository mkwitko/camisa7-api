import { describe, expect, it, vi } from "vitest";
import type { VenueRepository } from "@/http/api/venues/venue.repository";
import type { Venue } from "@/http/api/venues/venue.types";
import type { CourtRepository } from "../court.repository";
import type { Court } from "../court.types";
import { createCreateCourtService } from "./create-court.service";

const aVenue = (overrides: Partial<Venue> = {}): Venue => ({
  id: "v1",
  ownerId: "owner-1",
  name: "Arena X",
  latitude: -23,
  longitude: -46,
  address: "Rua 1",
  city: "SP",
  amenities: [],
  phone: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

const aCourt = (overrides: Partial<Court> = {}): Court => ({
  id: "c1",
  venueId: "v1",
  name: "Quadra 1",
  modality: "futsal",
  surface: null,
  slotMinutes: 60,
  bookingMode: "instant",
  depositPercent: null,
  active: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

function makeVenueRepo(venue: Venue | null): VenueRepository {
  return {
    insert: vi.fn(),
    findById: vi.fn().mockResolvedValue(venue),
    update: vi.fn(),
    listByOwner: vi.fn(),
  };
}

function makeCourtRepo(overrides: Partial<CourtRepository> = {}): CourtRepository {
  return {
    insert: vi.fn().mockResolvedValue(aCourt()),
    findById: vi.fn(),
    findByIdWithVenue: vi.fn(),
    update: vi.fn(),
    listByVenue: vi.fn(),
    replacePriceRules: vi.fn(),
    listPriceRules: vi.fn(),
    ...overrides,
  };
}

const input = {
  venueId: "v1",
  userId: "owner-1",
  name: "Quadra 1",
  modality: "futsal" as const,
  slotMinutes: 60,
  bookingMode: "instant" as const,
};

describe("createCreateCourtService", () => {
  it("creates a court with no price rules yet, when the caller owns the venue", async () => {
    const courtRepo = makeCourtRepo();
    const service = createCreateCourtService({ venueRepo: makeVenueRepo(aVenue()), courtRepo });

    const court = await service(input);

    expect(court.id).toBe("c1");
    expect(court.priceRules).toEqual([]);
    expect(courtRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({ venueId: "v1", name: "Quadra 1" }),
    );
  });

  it("rejects with VEN-T0002 when the venue doesn't exist", async () => {
    const courtRepo = makeCourtRepo();
    const service = createCreateCourtService({ venueRepo: makeVenueRepo(null), courtRepo });

    await expect(service(input)).rejects.toMatchObject({ code: "VEN-T0002" });
    expect(courtRepo.insert).not.toHaveBeenCalled();
  });

  it("rejects with VEN-T0003 when the caller isn't the venue owner", async () => {
    const courtRepo = makeCourtRepo();
    const service = createCreateCourtService({
      venueRepo: makeVenueRepo(aVenue({ ownerId: "owner-1" })),
      courtRepo,
    });

    await expect(service({ ...input, userId: "intruder" })).rejects.toMatchObject({
      code: "VEN-T0003",
    });
    expect(courtRepo.insert).not.toHaveBeenCalled();
  });
});
