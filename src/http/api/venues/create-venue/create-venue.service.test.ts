import { describe, expect, it, vi } from "vitest";
import type { AuthRepository } from "@/http/api/auth/auth.repository";
import type { Role, User } from "@/http/api/auth/auth.types";
import type { VenueRepository } from "../venue.repository";
import type { Venue } from "../venue.types";
import { createCreateVenueService } from "./create-venue.service";

const aUser = (roles: Role[]): User => ({
  id: "u1",
  email: "q@b.com",
  name: "Quadra Owner",
  roles,
  hasPassword: true,
  googleSub: null,
  lastCity: null,
  lastLat: null,
  lastLng: null,
  stripeCustomerId: null,
  stripeAccountId: null,
  createdAt: new Date().toISOString(),
});

const aVenue = (overrides: Partial<Venue> = {}): Venue => ({
  id: "v1",
  ownerId: "u1",
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

function makeAuthRepo(user: User | null): AuthRepository {
  return {
    findByEmail: vi.fn(),
    findById: vi.fn().mockResolvedValue(user),
    findByGoogleSub: vi.fn(),
    insert: vi.fn(),
    linkGoogle: vi.fn(),
    setRoles: vi.fn(),
    setPushToken: vi.fn(),
    getPushToken: vi.fn(),
    setLocation: vi.fn(),
    setStripeCustomerId: vi.fn(),
    setStripeAccountId: vi.fn(),
  };
}

function makeVenueRepo(overrides: Partial<VenueRepository> = {}): VenueRepository {
  return {
    insert: vi.fn().mockResolvedValue(aVenue()),
    findById: vi.fn(),
    update: vi.fn(),
    listByOwner: vi.fn(),
    ...overrides,
  };
}

const input = {
  userId: "u1",
  name: "Arena X",
  latitude: -23,
  longitude: -46,
  address: "Rua 1",
  city: "SP",
  amenities: ["gramado" as const],
  phone: "11999999999",
};

describe("createCreateVenueService", () => {
  it("creates a venue when the user has the `quadra` role", async () => {
    const venueRepo = makeVenueRepo();
    const service = createCreateVenueService({
      venueRepo,
      authRepo: makeAuthRepo(aUser(["jogador", "quadra"])),
    });

    const venue = await service(input);

    expect(venue.id).toBe("v1");
    expect(venueRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({ ownerId: "u1", name: "Arena X", amenities: ["gramado"] }),
    );
  });

  it("rejects with VEN-T0001 (soft-gate) when the user lacks the `quadra` role", async () => {
    const venueRepo = makeVenueRepo();
    const service = createCreateVenueService({
      venueRepo,
      authRepo: makeAuthRepo(aUser(["jogador"])),
    });

    await expect(service(input)).rejects.toMatchObject({ code: "VEN-T0001" });
    expect(venueRepo.insert).not.toHaveBeenCalled();
  });

  it("rejects with AUTH-T0004 when the user behind the token no longer exists", async () => {
    const venueRepo = makeVenueRepo();
    const service = createCreateVenueService({ venueRepo, authRepo: makeAuthRepo(null) });

    await expect(service(input)).rejects.toMatchObject({ code: "AUTH-T0004" });
    expect(venueRepo.insert).not.toHaveBeenCalled();
  });
});
