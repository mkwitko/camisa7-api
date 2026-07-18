import type { AuthRepository } from "@/http/api/auth/auth.repository";
import type { PrismaLike } from "@/infra/db/client";
import { getOrCreateCustomer, isBillingConfigured } from "@/infra/stripe/client";
import {
  createBookingPaymentIntent,
  type PixVoucher,
  retrieveAccountStatus,
} from "@/infra/stripe/connect";
import { ERRORS } from "@/shared/errors/catalog";
import { createBookingRepository } from "./booking.repository";
import type { Booking } from "./booking.types";

/**
 * Config-gate + live Connect check shared by every money-moving booking
 * transition (`create-booking`'s instant/deposit path, `approve-booking`).
 * Throws `BIL.DISABLED` (503) if Stripe isn't configured on this deploy,
 * `CON.NOT_READY` (409) if the owner never connected an account OR its
 * `charges_enabled` resolves false live (never cached). Returns the
 * account id for convenience (narrows the nullable `stripeAccountId`).
 */
export async function assertOwnerChargesEnabled(
  ownerStripeAccountId: string | null,
): Promise<string> {
  if (!isBillingConfigured) throw ERRORS.BIL.DISABLED();
  if (!ownerStripeAccountId) throw ERRORS.CON.NOT_READY();
  const status = await retrieveAccountStatus(ownerStripeAccountId);
  if (!status.chargesEnabled) throw ERRORS.CON.NOT_READY();
  return ownerStripeAccountId;
}

/**
 * Stripe's PIX minimum charge is 0.50 BRL (50 cents) — an `amount` below
 * that (including 0, e.g. a free court or a deposit that rounds to 0) is
 * invalid at Stripe and would otherwise blow up PaymentIntent creation
 * AFTER the booking/transition already committed. Callers MUST run this
 * before committing any state (booking insert, `requested` ->
 * `pending_payment` claim) so a doomed charge is rejected cleanly (422
 * `BKG.SLOT_NOT_BOOKABLE`) instead of leaving a stuck row for the expiry
 * sweep to clean up. Reuses `SLOT_NOT_BOOKABLE` rather than a new code —
 * same family as the structural "this slot can't be booked" check in
 * `create-booking.service.ts`.
 */
const STRIPE_PIX_MIN_AMOUNT_CENTS = 50;

export function assertChargeableAmount(amountCents: number): void {
  if (amountCents < STRIPE_PIX_MIN_AMOUNT_CENTS) throw ERRORS.BKG.SLOT_NOT_BOOKABLE();
}

export type CreatePaymentIntentDeps = {
  db: PrismaLike;
  authRepo: AuthRepository;
};

export type CreatePaymentIntentForBookingResult = {
  booking: Booking;
  payment: { paymentIntentId: string; clientSecret: string; pix: PixVoucher | null };
};

/**
 * Creates the destination-charge PaymentIntent for a `Booking` that already
 * exists (either just-inserted by `create-booking` for `instant`/`deposit`
 * modes, or approved by the owner for `request` mode) and persists its id
 * via `setPaymentIntent`. Assumes billing is configured and the owner's
 * connected account is `charges_enabled` — callers must resolve
 * `ownerStripeAccountId` via `assertOwnerChargesEnabled` first. Amount is
 * `booking.depositCents ?? booking.priceCents` (both already captured at
 * booking time).
 */
export async function createPaymentIntentForBooking(
  deps: CreatePaymentIntentDeps,
  args: { booking: Booking; ownerStripeAccountId: string },
): Promise<CreatePaymentIntentForBookingResult> {
  const booker = await deps.authRepo.findById(args.booking.bookedById);
  if (!booker) throw ERRORS.AUTH.UNAUTHORIZED();

  const amountCents = args.booking.depositCents ?? args.booking.priceCents;
  const customerId = await getOrCreateCustomer(deps.authRepo, booker);
  const pi = await createBookingPaymentIntent({
    amountCents,
    destinationAccountId: args.ownerStripeAccountId,
    bookingId: args.booking.id,
    customerId,
  });

  const bookingRepo = createBookingRepository(deps.db);
  const updated = await bookingRepo.setPaymentIntent(args.booking.id, pi.id);

  return {
    booking: updated,
    payment: { paymentIntentId: pi.id, clientSecret: pi.clientSecret, pix: pi.pix },
  };
}
