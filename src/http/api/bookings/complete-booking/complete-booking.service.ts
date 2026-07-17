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
 * `BKG.NOT_ALLOWED` (403). The final flip is an atomic `transitionStatus`
 * claim (`confirmed` -> `completed`) so a concurrent/retried complete can't
 * act twice on a stale `status === "confirmed"` read.
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

    const claimed = await deps.bookingRepo.transitionStatus(booking.id, ["confirmed"], "completed");
    if (claimed === 0) throw ERRORS.BKG.BAD_STATE();

    const updated = await deps.bookingRepo.findById(booking.id);
    if (!updated) throw ERRORS.BKG.NOT_FOUND();
    return updated;
  };
}
