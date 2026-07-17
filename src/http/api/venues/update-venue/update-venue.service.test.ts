import { describe, expect, it, vi } from "vitest";
import type { VenueRepository } from "../venue.repository";
import type { Venue } from "../venue.types";
import { createUpdateVenueService } from "./update-venue.service";

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

function makeVenueRepo(venue: Venue | null): VenueRepository {
  return {
    insert: vi.fn(),
    findById: vi.fn().mockResolvedValue(venue),
    update: vi.fn().mockImplementation(async (_id, patch) => aVenue({ ...patch })),
    listByOwner: vi.fn(),
  };
}

describe("createUpdateVenueService", () => {
  it("updates when the caller owns the venue", async () => {
    const venueRepo = makeVenueRepo(aVenue({ ownerId: "owner-1" }));
    const service = createUpdateVenueService({ venueRepo });

    const venue = await service({ venueId: "v1", userId: "owner-1", patch: { name: "Arena Y" } });

    expect(venue.name).toBe("Arena Y");
    expect(venueRepo.update).toHaveBeenCalledWith("v1", { name: "Arena Y" });
  });

  it("rejects with VEN-T0002 when the venue doesn't exist", async () => {
    const venueRepo = makeVenueRepo(null);
    const service = createUpdateVenueService({ venueRepo });

    await expect(
      service({ venueId: "v1", userId: "owner-1", patch: { name: "Arena Y" } }),
    ).rejects.toMatchObject({ code: "VEN-T0002" });
    expect(venueRepo.update).not.toHaveBeenCalled();
  });

  it("rejects with VEN-T0003 when the caller isn't the owner", async () => {
    const venueRepo = makeVenueRepo(aVenue({ ownerId: "owner-1" }));
    const service = createUpdateVenueService({ venueRepo });

    await expect(
      service({ venueId: "v1", userId: "intruder", patch: { name: "Arena Y" } }),
    ).rejects.toMatchObject({ code: "VEN-T0003" });
    expect(venueRepo.update).not.toHaveBeenCalled();
  });
});
