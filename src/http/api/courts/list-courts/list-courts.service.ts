import type { VenueRepository } from "@/http/api/venues/venue.repository";
import type { CourtRepository } from "../court.repository";
import type { CourtWithPriceRules } from "../court.types";

export type ListCourtsDeps = {
  courtRepo: CourtRepository;
  venueRepo: VenueRepository;
};

export type ListCourtsInput = { venueId: string; userId: string };

/**
 * Lists a `Venue`'s courts. The venue owner sees every court, including
 * `active:false` ones (their own management dashboard); any other
 * authenticated caller only sees `active:true` ones (the public booking
 * flow). No error is thrown for a non-owner or an unknown `venueId` — unlike
 * the mutations, this endpoint doesn't require ownership, it just narrows
 * what's visible.
 */
export function createListCourtsService(deps: ListCourtsDeps) {
  return async (input: ListCourtsInput): Promise<CourtWithPriceRules[]> => {
    const venue = await deps.venueRepo.findById(input.venueId);
    const includeInactive = venue?.ownerId === input.userId;

    const courts = await deps.courtRepo.listByVenue(input.venueId, { includeInactive });
    return Promise.all(
      courts.map(async (court) => ({
        ...court,
        priceRules: await deps.courtRepo.listPriceRules(court.id),
      })),
    );
  };
}
