import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod/v4";
import { env } from "@/config/env";
import { createAuthRepository } from "@/http/api/auth/auth.repository";
import { prisma } from "@/infra/db/client";
import { logger } from "@/infra/observability/logger";
import { isBillingConfigured, stripe } from "@/infra/stripe/client";
import { ERRORS } from "@/shared/errors/catalog";
import { getEntitlementsService } from "../entitlements.service";

const StripeWebhookResponse = z.object({ received: z.boolean() });

/** Pulls a customer id from an event's object (string, expanded object, or absent). */
function customerIdFrom(object: unknown): string | undefined {
  if (typeof object !== "object" || object === null) return undefined;
  const customer = (object as { customer?: unknown }).customer;
  if (typeof customer === "string") return customer;
  if (typeof customer === "object" && customer !== null && "id" in customer) {
    const id = (customer as { id?: unknown }).id;
    return typeof id === "string" ? id : undefined;
  }
  return undefined;
}

/**
 * `POST /webhooks/stripe` — public (bypasses `authHook`), consumes the RAW body
 * so the Stripe signature can be verified. On entitlement/subscription changes
 * it invalidates the cached entitlements for the affected customer so the next
 * `GET /billing/me` re-fetches from Stripe. Always acks verified events with
 * 200 (even unhandled types); 400 only on a bad signature; 503 when billing
 * isn't configured.
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

      if (
        event.type === "entitlements.active_entitlement_summary.updated" ||
        event.type.startsWith("customer.subscription.")
      ) {
        const customerId = customerIdFrom(event.data.object);
        if (customerId) {
          getEntitlementsService(createAuthRepository(prisma)).invalidate(customerId);
        }
      }

      return reply.code(200).send({ received: true });
    },
  );
};
