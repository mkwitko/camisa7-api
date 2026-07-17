import type { CourtRepository } from "@/http/api/courts/court.repository";
import { ERRORS } from "@/shared/errors/catalog";
import { type AvailabilitySlot, computeAvailability } from "../availability.service";
import type { BookingRepository } from "../booking.repository";

export type GetAvailabilityDeps = {
  courtRepo: CourtRepository;
  bookingRepo: BookingRepository;
};

export type GetAvailabilityInput = { courtId: string; date: string };

/**
 * `GET /courts/:id/availability?date=`. Any authenticated user (no
 * ownership check — availability is public-ish info any booker needs to
 * see, unlike `PATCH`/price-rules which are owner-only). `ERRORS.CRT.NOT_FOUND()`
 * (404) for an unknown court id.
 */
export function createGetAvailabilityService(deps: GetAvailabilityDeps) {
  return async (input: GetAvailabilityInput): Promise<AvailabilitySlot[]> => {
    const court = await deps.courtRepo.findById(input.courtId);
    if (!court) throw ERRORS.CRT.NOT_FOUND();

    const priceRules = await deps.courtRepo.listPriceRules(input.courtId);
    const activeStartMinutes = await deps.bookingRepo.activeSlotsFor(input.courtId, input.date);

    return computeAvailability(court, priceRules, input.date, activeStartMinutes);
  };
}
