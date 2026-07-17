import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createAuthRepository } from "@/http/api/auth/auth.repository";
import { PLANS } from "@/http/api/billing/billing.catalog";
import { requireUser } from "@/http/hooks/auth";
import { env } from "@/config/env";
import { prisma } from "@/infra/db/client";
import { getOrCreateCustomer, isBillingConfigured, stripe } from "@/infra/stripe/client";
import { ERRORS } from "@/shared/errors/catalog";
import { BillingCheckoutBody, BillingUrlResponse } from "./billing-checkout.schema";

/**
 * `POST /billing/checkout` (auth) — starts a Stripe Checkout Session
 * (subscription mode) for the chosen plan and returns the hosted URL. The app
 * opens it in a browser; on completion Stripe redirects to the deep-link
 * `<scheme>://billing/return`. 503 when billing isn't configured.
 */
export const billingCheckoutRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().post(
    "/billing/checkout",
    {
      schema: {
        operationId: "createBillingCheckout",
        tags: ["billing"],
        body: BillingCheckoutBody,
        response: { 200: BillingUrlResponse },
      },
    },
    async (req, reply) => {
      if (!isBillingConfigured) throw ERRORS.BIL.DISABLED();
      const { userId } = requireUser(req);

      const authRepo = createAuthRepository(prisma);
      const user = await authRepo.findById(userId);
      if (!user) throw ERRORS.AUTH.UNAUTHORIZED();

      // The plan's price id must be configured on this deploy — a billing-on
      // deploy that didn't set this plan's price simply can't sell it.
      const price = env[PLANS[req.body.plan].priceEnv];
      if (!price) throw ERRORS.BIL.DISABLED();

      const customer = await getOrCreateCustomer(authRepo, user);
      const scheme = env.APP_DEEPLINK_SCHEME;
      const session = await stripe().checkout.sessions.create({
        mode: "subscription",
        customer,
        line_items: [{ price, quantity: 1 }],
        success_url: `${scheme}://billing/return?status=success`,
        cancel_url: `${scheme}://billing/return?status=cancel`,
      });

      if (!session.url) throw ERRORS.BIL.DISABLED();
      void reply.code(200).send({ url: session.url });
    },
  );
};
