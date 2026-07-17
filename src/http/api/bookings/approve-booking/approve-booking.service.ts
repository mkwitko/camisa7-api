import type { AuthRepository } from "@/http/api/auth/auth.repository";
import type { CourtRepository } from "@/http/api/courts/court.repository";
import type { PrismaLike } from "@/infra/db/client";
import { ERRORS } from "@/shared/errors/catalog";
import { assertOwnerChargesEnabled, createPaymentIntentForBooking } from "../booking.payment";
import { presentBooking } from "../booking.presenter";
import type { BookingRepository } from "../booking.repository";
import type { BookingResponse } from "../booking.schema";

export type ApproveBookingDeps = {
  db: PrismaLike;
  bookingRepo: BookingRepository;
  courtRepo: CourtRepository;
  authRepo: AuthRepository;
};

export type ApproveBookingInput = { bookingId: string; userId: string };

export type ApproveBookingResult = {
  booking: BookingResponse;
  payment: { paymentIntentId: string; clientSecret: string };
};

/**
 * `POST /bookings/:id/approve` — the venue owner approves a `mode ===
 * "request"` booking still `status === "requested"`; any other
 * mode/status combo is `BKG.BAD_STATE` (409) (mirrors `create-booking`'s
 * "request mode holds off on money" design — this is where it catches up).
 * Non-owner callers get `BKG.NOT_ALLOWED` (403). On success: the same
 * config-gate + Connect check as `create-booking`
 * (`assertOwnerChargesEnabled` — `BIL.DISABLED`/`CON.NOT_READY`), then a
 * destination-charge PaymentIntent for `depositCents ?? priceCents`
 * (`createPaymentIntentForBooking`, shared with `create-booking`), then the
 * booking transitions to `pending_payment`.
 */
export function createApproveBookingService(deps: ApproveBookingDeps) {
  return async (input: ApproveBookingInput): Promise<ApproveBookingResult> => {
    const booking = await deps.bookingRepo.findById(input.bookingId);
    if (!booking) throw ERRORS.BKG.NOT_FOUND();

    const court = await deps.courtRepo.findByIdWithVenue(booking.courtId);
    if (!court || court.venue.ownerId !== input.userId) throw ERRORS.BKG.NOT_ALLOWED();

    if (booking.mode !== "request" || booking.status !== "requested") {
      throw ERRORS.BKG.BAD_STATE();
    }

    const owner = await deps.authRepo.findById(court.venue.ownerId);
    const ownerStripeAccountId = await assertOwnerChargesEnabled(owner?.stripeAccountId ?? null);

    const { booking: withPayment, payment } = await createPaymentIntentForBooking(
      { db: deps.db, authRepo: deps.authRepo },
      { booking, ownerStripeAccountId },
    );
    const confirmed = await deps.bookingRepo.setStatus(withPayment.id, "pending_payment");

    return { booking: presentBooking(confirmed), payment };
  };
}
