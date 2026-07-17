import type { AuthRepository } from "@/http/api/auth/auth.repository";
import type { CourtRepository } from "@/http/api/courts/court.repository";
import type { PrismaLike } from "@/infra/db/client";
import { ERRORS } from "@/shared/errors/catalog";
import { resolveSlotPrice } from "../availability.service";
import { assertOwnerChargesEnabled, createPaymentIntentForBooking } from "../booking.payment";
import { presentBooking } from "../booking.presenter";
import { createBookingRepository } from "../booking.repository";
import type { BookingResponse } from "../booking.schema";

export type CreateBookingDeps = {
  db: PrismaLike;
  courtRepo: CourtRepository;
  authRepo: AuthRepository;
};

export type CreateBookingInput = {
  courtId: string;
  date: string;
  startMinute: number;
  endMinute: number;
  userId: string;
};

export type CreateBookingResult = {
  booking: BookingResponse;
  payment?: { paymentIntentId: string; clientSecret: string };
};

/**
 * `POST /bookings` — the core booking flow (Marketplace V2). Any
 * authenticated user may book any active court; no ownership check (unlike
 * `PATCH /courts/:id`, which is owner-only).
 *
 * Flow (brief order matters — each step's error preempts the next):
 * 1. Court must exist (`CRT.NOT_FOUND`, 404) and be `active`
 *    (`BKG.COURT_INACTIVE`, 409).
 * 2. The requested `[startMinute, endMinute)` must land exactly on the
 *    court's price-rule + `slotMinutes` grid (`resolveSlotPrice`), else
 *    `BKG.SLOT_NOT_BOOKABLE` (422) — a structural check, independent of
 *    occupancy.
 * 3. Money flow is config-gated: `BIL.DISABLED` (503) if Stripe isn't
 *    configured on this deploy, `CON.NOT_READY` (409) if the court owner
 *    (`court.venue.ownerId`) has no connected account yet OR its
 *    `charges_enabled` resolves false live (never cached — same rationale
 *    as entitlements).
 * 4. Insert the `Booking` inside a transaction: re-check
 *    `activeSlotsFor` first (fast, friendly 409 in the common no-race
 *    case), then insert — the `Booking_slot_active_uniq` partial unique
 *    index is the real guard against a concurrent double-book; `insert`
 *    maps its P2002 to the same `BKG.SLOT_UNAVAILABLE`.
 * 5. `mode === "request"` returns `{ booking }` with no payment (the owner
 *    must approve before any money moves — a later task's lifecycle
 *    transition creates the PaymentIntent then). Otherwise
 *    (`instant`/`deposit`) a destination-charge PaymentIntent is created
 *    for `depositCents ?? priceCents` against the owner's connected
 *    account, `setPaymentIntent` persists its id, and both the id + PIX
 *    `clientSecret` are returned to the caller.
 */
export function createCreateBookingService(deps: CreateBookingDeps) {
  return async (input: CreateBookingInput): Promise<CreateBookingResult> => {
    const court = await deps.courtRepo.findByIdWithVenue(input.courtId);
    if (!court) throw ERRORS.CRT.NOT_FOUND();
    if (!court.active) throw ERRORS.BKG.COURT_INACTIVE();

    const priceRules = await deps.courtRepo.listPriceRules(input.courtId);
    const priceCents = resolveSlotPrice(
      court,
      priceRules,
      input.date,
      input.startMinute,
      input.endMinute,
    );
    if (priceCents === null) throw ERRORS.BKG.SLOT_NOT_BOOKABLE();

    const owner = await deps.authRepo.findById(court.venue.ownerId);
    const ownerStripeAccountId = await assertOwnerChargesEnabled(owner?.stripeAccountId ?? null);

    const depositCents =
      court.bookingMode === "deposit"
        ? Math.round((priceCents * (court.depositPercent ?? 0)) / 100)
        : null;
    const initialStatus = court.bookingMode === "request" ? "requested" : "pending_payment";

    const booking = await deps.db.$transaction(async (tx) => {
      const bookingRepo = createBookingRepository(tx);
      const occupied = await bookingRepo.activeSlotsFor(input.courtId, input.date);
      if (occupied.includes(input.startMinute)) throw ERRORS.BKG.SLOT_UNAVAILABLE();

      return bookingRepo.insert({
        courtId: input.courtId,
        bookedById: input.userId,
        date: input.date,
        startMinute: input.startMinute,
        endMinute: input.endMinute,
        priceCents,
        mode: court.bookingMode,
        status: initialStatus,
        depositCents,
      });
    });

    if (court.bookingMode === "request") {
      return { booking: presentBooking(booking) };
    }

    const { booking: updated, payment } = await createPaymentIntentForBooking(
      { db: deps.db, authRepo: deps.authRepo },
      { booking, ownerStripeAccountId },
    );

    return { booking: presentBooking(updated), payment };
  };
}
