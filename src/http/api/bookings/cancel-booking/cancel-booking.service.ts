import type { CourtRepository } from "@/http/api/courts/court.repository";
import { logger } from "@/infra/observability/logger";
import { stripe } from "@/infra/stripe/client";
import { ERRORS } from "@/shared/errors/catalog";
import type { BookingRepository } from "../booking.repository";
import type { Booking, BookingStatus } from "../booking.types";

export type CancelBookingDeps = {
  bookingRepo: BookingRepository;
  courtRepo: CourtRepository;
};

export type CancelBookingInput = { bookingId: string; userId: string };

/** Statuses a booking may be cancelled from — mirrors the brief's B7 step 2. */
const CANCELLABLE_STATUSES: BookingStatus[] = ["requested", "pending_payment", "confirmed"];

/**
 * `POST /bookings/:id/cancel` — either the booker (`bookedById`) or the
 * venue owner (`court.venue.ownerId`, loaded via `findByIdWithVenue`) may
 * cancel; anyone else gets `BKG.NOT_ALLOWED` (403). Only from
 * `requested`/`pending_payment`/`confirmed` — otherwise `BKG.BAD_STATE`
 * (409), e.g. an already-cancelled or completed booking. The final flip is
 * an atomic `transitionStatus` claim (any `CANCELLABLE_STATUSES` ->
 * `cancelled`) so a concurrent/retried cancel (or a race with
 * approve/reject/complete) can't act twice on a stale read; a losing claim
 * (`count === 0`) is `BKG.BAD_STATE` and never touches Stripe. Only after a
 * successful claim, if the booking had an open `stripePaymentIntentId`,
 * cancelling it at Stripe is best-effort: a failure there (network hiccup,
 * already-captured PI, etc) must never block the DB cancel the caller is
 * waiting on — logged, not rethrown. PIX refund for an already-captured
 * payment is explicitly out of scope (brief).
 */
export function createCancelBookingService(deps: CancelBookingDeps) {
  return async (input: CancelBookingInput): Promise<Booking> => {
    const booking = await deps.bookingRepo.findById(input.bookingId);
    if (!booking) throw ERRORS.BKG.NOT_FOUND();

    const court = await deps.courtRepo.findByIdWithVenue(booking.courtId);
    const isBooker = booking.bookedById === input.userId;
    const isOwner = court?.venue.ownerId === input.userId;
    if (!isBooker && !isOwner) throw ERRORS.BKG.NOT_ALLOWED();

    if (!CANCELLABLE_STATUSES.includes(booking.status)) throw ERRORS.BKG.BAD_STATE();

    const claimed = await deps.bookingRepo.transitionStatus(
      booking.id,
      CANCELLABLE_STATUSES,
      "cancelled",
    );
    if (claimed === 0) throw ERRORS.BKG.BAD_STATE();

    if (booking.stripePaymentIntentId) {
      await cancelPaymentIntentBestEffort(booking.stripePaymentIntentId);
    }

    const updated = await deps.bookingRepo.findById(booking.id);
    if (!updated) throw ERRORS.BKG.NOT_FOUND();
    return updated;
  };
}

async function cancelPaymentIntentBestEffort(paymentIntentId: string): Promise<void> {
  try {
    await stripe().paymentIntents.cancel(paymentIntentId);
  } catch (error) {
    logger.warn(
      { paymentIntentId, err: error },
      "cancel-booking: failed to cancel PaymentIntent at Stripe",
    );
  }
}
