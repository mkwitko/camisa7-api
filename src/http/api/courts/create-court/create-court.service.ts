import { assertVenueOwner } from "@/http/api/venues/venue.authz";
import type { VenueRepository } from "@/http/api/venues/venue.repository";
import type { CourtRepository } from "../court.repository";
import type { CreateCourtBody } from "../court.schema";
import type { CourtWithPriceRules } from "../court.types";

export type CreateCourtDeps = {
  venueRepo: VenueRepository;
  courtRepo: CourtRepository;
};

export type CreateCourtInput = CreateCourtBody & { venueId: string; userId: string };

/**
 * Creates a `Court` inside a `Venue`. Owner-only: `assertVenueOwner` (the
 * REAL authorization — a court has no `ownerId` of its own, it always flows
 * through its parent `Venue`). A freshly created court never has price
 * rules yet (`PUT /courts/:id/price-rules` is a separate step), so
 * `priceRules` is always `[]` here.
 */
export function createCreateCourtService(deps: CreateCourtDeps) {
  return async (input: CreateCourtInput): Promise<CourtWithPriceRules> => {
    const venue = await deps.venueRepo.findById(input.venueId);
    assertVenueOwner(venue, input.userId);

    const court = await deps.courtRepo.insert({
      venueId: input.venueId,
      name: input.name,
      modality: input.modality,
      surface: input.surface ?? null,
      slotMinutes: input.slotMinutes,
      bookingMode: input.bookingMode,
      depositPercent: input.depositPercent ?? null,
    });

    return { ...court, priceRules: [] };
  };
}
