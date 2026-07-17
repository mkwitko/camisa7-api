import type { CourtRepository } from "@/http/api/courts/court.repository";
import { ERRORS } from "@/shared/errors/catalog";
import type { BookingRepository } from "../booking.repository";
import type { Booking } from "../booking.types";

export type CompleteBookingDeps = {
  bookingRepo: BookingRepository;
  courtRepo: CourtRepository;
};

export type CompleteBookingInput = { bookingId: string; userId: string };

/**
 * `POST /bookings/:id/complete` — the venue owner marks a `mode ===
 * "deposit"` booking `confirmed` (the balance was settled off-platform,
 * e.g. cash on arrival — only the deposit went through Stripe) as
 * `completed`. Any other mode/status is `BKG.BAD_STATE` (409); non-owner is
 * `BKG.NOT_ALLOWED` (403).
 */
export function createCompleteBookingService(deps: CompleteBookingDeps) {
  return async (input: CompleteBookingInput): Promise<Booking> => {
    const booking = await deps.bookingRepo.findById(input.bookingId);
    if (!booking) throw ERRORS.BKG.NOT_FOUND();

    const court = await deps.courtRepo.findByIdWithVenue(booking.courtId);
    if (!court || court.venue.ownerId !== input.userId) throw ERRORS.BKG.NOT_ALLOWED();

    if (booking.mode !== "deposit" || booking.status !== "confirmed") {
      throw ERRORS.BKG.BAD_STATE();
    }

    return deps.bookingRepo.setStatus(booking.id, "completed");
  };
}
