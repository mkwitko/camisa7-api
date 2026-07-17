import { describe, expect, it, vi } from "vitest";
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
    });

    const match = await service({ ...baseBody, latitude: -10, longitude: -20, city: "Rio" });

    expect(match).toMatchObject({ venueId: null, latitude: -10, longitude: -20, city: "Rio" });
  });
});
