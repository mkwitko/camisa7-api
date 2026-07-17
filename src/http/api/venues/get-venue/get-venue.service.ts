import { ERRORS } from "@/shared/errors/catalog";
import type { VenueRepository } from "../venue.repository";
import type { Venue } from "../venue.types";

export type GetVenueDeps = { venueRepo: VenueRepository };

/**
 * Reads a `Venue` by id for any authenticated caller — the public-facing venue
 * profile the app shows on discovery/match screens (`Match.venueId`). No
 * ownership check (anyone can view a venue's name/coords/amenities); 404 when
 * the id doesn't exist.
 */
export function createGetVenueService(deps: GetVenueDeps) {
  return async (venueId: string): Promise<Venue> => {
    const venue = await deps.venueRepo.findById(venueId);
    if (!venue) throw ERRORS.VEN.NOT_FOUND();
    return venue;
  };
}
