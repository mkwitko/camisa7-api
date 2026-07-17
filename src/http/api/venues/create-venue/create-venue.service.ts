import type { AuthRepository } from "@/http/api/auth/auth.repository";
import { ERRORS } from "@/shared/errors/catalog";
import type { VenueRepository } from "../venue.repository";
import type { CreateVenueBody } from "../venue.schema";
import type { Venue } from "../venue.types";

export type CreateVenueDeps = {
  venueRepo: VenueRepository;
  authRepo: AuthRepository;
};

export type CreateVenueInput = CreateVenueBody & { userId: string };

/**
 * Creates a `Venue` owned by the caller. Soft-gate: the caller's `User.roles`
 * must include `quadra` — roles are self-declared (feature-unlock/intenção),
 * so this is a UX gate, NOT a security boundary. The real authorization is
 * ownership (`assertVenueOwner`, on every mutation). We load the user via
 * `authRepo.findById` purely to read `roles`; an unknown/deleted user (token
 * valid but user gone) surfaces as `AUTH.UNAUTHORIZED`.
 */
export function createCreateVenueService(deps: CreateVenueDeps) {
  return async (input: CreateVenueInput): Promise<Venue> => {
    const user = await deps.authRepo.findById(input.userId);
    if (!user) throw ERRORS.AUTH.UNAUTHORIZED();
    if (!user.roles.includes("quadra")) throw ERRORS.VEN.ROLE_REQUIRED();

    return deps.venueRepo.insert({
      ownerId: input.userId,
      name: input.name,
      latitude: input.latitude,
      longitude: input.longitude,
      address: input.address,
      city: input.city,
      amenities: input.amenities,
      phone: input.phone ?? null,
    });
  };
}
