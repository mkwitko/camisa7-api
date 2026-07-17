import { assertGroupOwner } from "@/http/api/groups/groups.authz";
import type { GroupsRepository } from "@/http/api/groups/groups.repository";
import type { VenueRepository } from "@/http/api/venues/venue.repository";
import { ERRORS } from "@/shared/errors/catalog";
import type { MatchesRepository } from "../matches.repository";
import type { Match } from "../matches.types";
import type { CreateMatchBody } from "./create-match.schema";

export type CreateMatchDeps = {
  matchesRepo: MatchesRepository;
  groupsRepo: GroupsRepository;
  venueRepo: VenueRepository;
};

export type CreateMatchInput = CreateMatchBody & { groupId: string; userId: string };

/**
 * Owner creates a `Match` inside their own group. Always starts `open`.
 *
 * Marketplace V1: when `venueId` is given, the match is linked to that `Venue`
 * and the venue becomes the source of location — its `latitude/longitude/city/
 * address` are copied onto the match, OVERRIDING any manual coords in the body.
 * An unknown `venueId` is rejected (`VEN.NOT_FOUND`); no ownership check on the
 * venue (an organizer may schedule a pelada at any venue, not only their own).
 */
export function createCreateMatchService(deps: CreateMatchDeps) {
  return async (input: CreateMatchInput): Promise<Match> => {
    const group = await deps.groupsRepo.findById(input.groupId);
    assertGroupOwner(group, input.userId);

    let location: {
      latitude: number | null;
      longitude: number | null;
      city: string | null;
      address: string | null;
      venueId: string | null;
    };
    if (input.venueId === undefined) {
      location = {
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        city: input.city ?? null,
        address: input.address ?? null,
        venueId: null,
      };
    } else {
      const venue = await deps.venueRepo.findById(input.venueId);
      if (!venue) throw ERRORS.VEN.NOT_FOUND();
      location = {
        latitude: venue.latitude,
        longitude: venue.longitude,
        city: venue.city,
        address: venue.address,
        venueId: venue.id,
      };
    }

    return deps.matchesRepo.insert({
      groupId: input.groupId,
      datetime: input.datetime,
      location: input.location,
      priceCents: input.priceCents ?? 0,
      slots: input.slots,
      pixKey: input.pixKey ?? null,
      modality: input.modality,
      ...location,
    });
  };
}
