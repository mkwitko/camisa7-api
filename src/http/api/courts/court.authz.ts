import { ERRORS } from "@/shared/errors/catalog";
import type { CourtWithVenue } from "./court.types";

/**
 * Ownership-authorization primitive for `Court` — mirrors `assertVenueOwner`.
 * Throws `ERRORS.CRT.NOT_FOUND()` (404) if `court` is null (unknown id, or it
 * belongs to someone else and was looked up by id without an ownership
 * filter — deliberately not leaking existence), `ERRORS.CRT.NOT_OWNER()`
 * (403) if it exists but the parent `Venue.ownerId` doesn't match — a court
 * has no `ownerId` of its own, ownership always flows through its `Venue`.
 * Narrows the return type to non-null `CourtWithVenue`.
 */
export function assertCourtOwner(court: CourtWithVenue | null, userId: string): CourtWithVenue {
  if (!court) throw ERRORS.CRT.NOT_FOUND();
  if (court.venue.ownerId !== userId) throw ERRORS.CRT.NOT_OWNER();
  return court;
}
