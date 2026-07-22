import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod/v4";
import { env } from "@/config/env";
import { createBookingRepository } from "@/http/api/bookings/booking.repository";
import { prisma } from "@/infra/db/client";
import { logger } from "@/infra/observability/logger";
import { isBillingConfigured, stripe } from "@/infra/stripe/client";
import { ERRORS } from "@/shared/errors/catalog";

const StripeWebhookResponse = z.object({ received: z.boolean() });

/** Pulls the PaymentIntent id from a `payment_intent.*` event's object. */
function paymentIntentIdFrom(object: unknown): string | undefined {
  if (typeof object !== "object" || object === null) return undefined;
  const id = (object as { id?: unknown }).id;
  return typeof id === "string" ? id : undefined;
}

/**
 * `POST /webhooks/stripe` — public (bypasses `authHook`), consumes the RAW body
 * so the Stripe signature can be verified. On `payment_intent.*` (Marketplace
 * V2) it moves the correlated `Booking` through its payment lifecycle —
 * `succeeded` → `confirmed`, `payment_failed`/`canceled` → `expired` (frees
 * the slot) — via the guarded, idempotent `transitionStatus`. Always acks
 * verified events with 200 (even unhandled types, and even if the
 * `payment_intent.*` side effect errors — logged, never thrown); 400 only on
 * a bad signature; 503 when billing isn't configured.
 */
export const stripeWebhookRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().post(
    "/webhooks/stripe",
    {
      schema: {
        operationId: "stripeWebhook",
        tags: ["billing"],
        // The body is validated by the Stripe signature, not by zod — the raw
        // bytes must reach `constructEvent` untouched.
        body: z.any(),
        // 400 on a bad/missing signature; 200 acks every verified event.
        response: { 200: StripeWebhookResponse, 400: StripeWebhookResponse },
      },
      config: { public: true, rawBody: true },
    },
    async (req, reply) => {
      if (!isBillingConfigured || !env.STRIPE_WEBHOOK_SECRET) throw ERRORS.BIL.DISABLED();

      const signature = req.headers["stripe-signature"];
      const rawBody = req.rawBody;
      if (!signature || rawBody === undefined) {
        return reply.code(400).send({ received: false });
      }

      let event: ReturnType<ReturnType<typeof stripe>["webhooks"]["constructEvent"]>;
      try {
        event = stripe().webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
      } catch (error) {
        logger.warn({ err: error }, "stripe-webhook: signature verification failed");
        return reply.code(400).send({ received: false });
      }

      // Marketplace V2: booking payment lifecycle. `stripePaymentIntentId` is
      // set on the booking when the PaymentIntent is created (`create-booking`
      // for instant/deposit, `approve-booking` for request mode) — an unknown
      // PI (not ours, or already resolved) is silently ignored. Transitions are
      // idempotent via `transitionStatus`'s guarded `WHERE status IN (...)`:
      // `count === 0` (already `confirmed`/`expired`/a retried delivery) is a
      // no-op, never an error — this handler never throws for these events.
      if (event.type.startsWith("payment_intent.")) {
        const paymentIntentId = paymentIntentIdFrom(event.data.object);
        if (paymentIntentId) {
          try {
            const bookingRepo = createBookingRepository(prisma);
            const booking = await bookingRepo.findByPaymentIntentId(paymentIntentId);
            if (booking) {
              if (event.type === "payment_intent.succeeded") {
                await bookingRepo.transitionStatus(booking.id, ["pending_payment"], "confirmed");
              } else if (
                event.type === "payment_intent.payment_failed" ||
                event.type === "payment_intent.canceled"
              ) {
                await bookingRepo.transitionStatus(booking.id, ["pending_payment"], "expired");
              }
            }
          } catch (error) {
            logger.error(
              { err: error, paymentIntentId },
              "stripe-webhook: payment_intent handling failed",
            );
          }
        }
      }

      return reply.code(200).send({ received: true });
    },
  );
};
