import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createAuthRepository } from "@/http/api/auth/auth.repository";
import { requireUser } from "@/http/hooks/auth";
import { prisma } from "@/infra/db/client";
import { getEntitlementsService } from "../entitlements.service";
import { BillingMeResponse } from "./billing-me.schema";

/**
 * `GET /billing/me` (auth) — the app's single source for entitlement state:
 * the caller's active features + whether in-app payment UI should be shown.
 * Never 503s: billing-off simply yields no features (reviewers still get all),
 * so the app always has an answer.
 */
export const billingMeRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().get(
    "/billing/me",
    {
      schema: {
        operationId: "getBillingMe",
        tags: ["billing"],
        response: { 200: BillingMeResponse },
      },
    },
    async (req, reply) => {
      const service = getEntitlementsService(createAuthRepository(prisma));
      const { userId } = requireUser(req);
      const [features, paymentsEnabled] = await Promise.all([
        service.activeFeatures(userId),
        service.paymentsEnabled(userId),
      ]);
      void reply.code(200).send({ features: [...features], paymentsEnabled });
    },
  );
};
