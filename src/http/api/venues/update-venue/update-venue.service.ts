import { assertVenueOwner } from "../venue.authz";
import type { UpdateVenueBody } from "../venue.schema";
import type { VenueRepository } from "../venue.repository";
import type { Venue } from "../venue.types";

export type UpdateVenueDeps = { venueRepo: VenueRepository };

export type UpdateVenueInput = {
  venueId: string;
  userId: string;
  patch: UpdateVenueBody;
};

/**
 * Owner-only update of a `Venue`. Fetch, `assertVenueOwner` (404 unknown / 403
 * not owner — the REAL authorization, roles are only a create-time UX gate),
 * then apply the patch via the repo's conditional-spread `update`.
 */
export function createUpdateVenueService(deps: UpdateVenueDeps) {
  return async (input: UpdateVenueInput): Promise<Venue> => {
    const venue = await deps.venueRepo.findById(input.venueId);
    assertVenueOwner(venue, input.userId);

    return deps.venueRepo.update(input.venueId, input.patch);
  };
}
