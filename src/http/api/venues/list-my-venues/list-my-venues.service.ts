import type { VenueRepository } from "../venue.repository";
import type { Venue } from "../venue.types";

export type ListMyVenuesDeps = { venueRepo: VenueRepository };

/** Lists the caller's own venues (the web dashboard list). `Venue.ownerId === userId`. */
export function createListMyVenuesService(deps: ListMyVenuesDeps) {
  return async (userId: string): Promise<Venue[]> => deps.venueRepo.listByOwner(userId);
}
