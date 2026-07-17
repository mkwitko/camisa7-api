import type { CourtRepository } from "@/http/api/courts/court.repository";
import { ERRORS } from "@/shared/errors/catalog";
import type { BookingRepository } from "../booking.repository";
import type { Booking } from "../booking.types";

export type RejectBookingDeps = {
  bookingRepo: BookingRepository;
  courtRepo: CourtRepository;
};

export type RejectBookingInput = { bookingId: string; userId: string };

/**
 * `POST /bookings/:id/reject` — the venue owner declines a `mode ===
 * "request"` booking still `status === "requested"`, freeing the slot
 * (`activeSlotsFor`/the partial unique index only covers ACTIVE statuses,
 * and `rejected` isn't one of them). Any other mode/status is
 * `BKG.BAD_STATE` (409); non-owner is `BKG.NOT_ALLOWED` (403).
 */
export function createRejectBookingService(deps: RejectBookingDeps) {
  return async (input: RejectBookingInput): Promise<Booking> => {
    const booking = await deps.bookingRepo.findById(input.bookingId);
    if (!booking) throw ERRORS.BKG.NOT_FOUND();

    const court = await deps.courtRepo.findByIdWithVenue(booking.courtId);
    if (!court || court.venue.ownerId !== input.userId) throw ERRORS.BKG.NOT_ALLOWED();

    if (booking.mode !== "request" || booking.status !== "requested") {
      throw ERRORS.BKG.BAD_STATE();
    }

    return deps.bookingRepo.setStatus(booking.id, "rejected");
  };
}
