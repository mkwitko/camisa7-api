import type { BookingRepository } from "@/http/api/bookings/booking.repository";

const PENDING_PAYMENT_TTL_MS = 30 * 60 * 1000;
const REQUESTED_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Cron body wired in `src/server.ts` (`node-cron`, skipped when
 * `NODE_ENV === "test"` — same convention `finalize-matches.job.ts`/
 * `recurrence.job.ts` use). `now` is INJECTED — never read internally via
 * `Date.now()`/`new Date()` — so tests can pin it.
 *
 * Best-effort safety net, NOT the primary path: `pending_payment` bookings
 * are normally freed by the `payment_intent.payment_failed`/`canceled`
 * webhook (see `stripe-webhook.controller.ts`) the moment Stripe reports a
 * terminal failure. This sweep catches PaymentIntents that never got a
 * terminal webhook at all (e.g. an abandoned PIX QR — nobody scanned it and
 * nobody explicitly canceled), expiring anything still `pending_payment`
 * past the 30-minute PIX TTL. It also expires `request`-mode bookings the
 * owner never approved/rejected within 24h, freeing the slot either way.
 */
export async function expireStaleBookings(
  bookingRepo: BookingRepository,
  now: Date,
): Promise<{ pendingExpired: number; requestedExpired: number }> {
  const pendingBefore = new Date(now.getTime() - PENDING_PAYMENT_TTL_MS);
  const requestedBefore = new Date(now.getTime() - REQUESTED_TTL_MS);
  return bookingRepo.expireStale(pendingBefore, requestedBefore);
}
