import { ERRORS } from "@/shared/errors/catalog";
import type { Venue } from "./venue.types";

/**
 * Ownership-authorization primitive for `Venue` — mirrors `assertGroupOwner`.
 * Throws `ERRORS.VEN.NOT_FOUND()` (404) if `venue` is null (unknown id, or it
 * belongs to someone else and was looked up by id without an ownership filter
 * — deliberately not leaking existence), `ERRORS.VEN.NOT_OWNER()` (403) if it
 * exists but `ownerId` doesn't match. Narrows the return type to non-null
 * `Venue`. This is the REAL authorization on venue mutations (roles are only a
 * soft UX-gate, not a security boundary).
 */
export function assertVenueOwner(venue: Venue | null, userId: string): Venue {
  if (!venue) throw ERRORS.VEN.NOT_FOUND();
  if (venue.ownerId !== userId) throw ERRORS.VEN.NOT_OWNER();
  return venue;
}
