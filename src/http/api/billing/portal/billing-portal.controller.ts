import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { env } from "@/config/env";
import { createAuthRepository } from "@/http/api/auth/auth.repository";
import { BillingUrlResponse } from "@/http/api/billing/checkout/billing-checkout.schema";
import { requireUser } from "@/http/hooks/auth";
import { prisma } from "@/infra/db/client";
import { getOrCreateCustomer, isBillingConfigured, stripe } from "@/infra/stripe/client";
import { ERRORS } from "@/shared/errors/catalog";

/**
 * `POST /billing/portal` (auth) — opens a Stripe Billing Portal session so the
 * user can manage/cancel their subscription, returning the hosted URL. 503
 * when billing isn't configured.
 */
export const billingPortalRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().post(
    "/billing/portal",
    {
      schema: {
        operationId: "createBillingPortal",
        tags: ["billing"],
        response: { 200: BillingUrlResponse },
      },
    },
    async (req, reply) => {
      if (!isBillingConfigured) throw ERRORS.BIL.DISABLED();
      const { userId } = requireUser(req);

      const authRepo = createAuthRepository(prisma);
      const user = await authRepo.findById(userId);
      if (!user) throw ERRORS.AUTH.UNAUTHORIZED();

      const customer = await getOrCreateCustomer(authRepo, user);
      const session = await stripe().billingPortal.sessions.create({
        customer,
        return_url: `${env.APP_DEEPLINK_SCHEME}://billing/return`,
      });

      void reply.code(200).send({ url: session.url });
    },
  );
};
