import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createAuthRepository } from "@/http/api/auth/auth.repository";
import { requireUser } from "@/http/hooks/auth";
import { prisma } from "@/infra/db/client";
import { createEntitlementsService } from "../entitlements.service";
import { createSubscriptionsRepository } from "../subscription.repository";
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
      const subscriptionsRepo = createSubscriptionsRepository(prisma);
      const service = createEntitlementsService({
        authRepo: createAuthRepository(prisma),
        subscriptionsRepo,
      });
      const { userId } = requireUser(req);
      const [features, paymentsEnabled, latest] = await Promise.all([
        service.activeFeatures(userId),
        service.paymentsEnabled(userId),
        subscriptionsRepo.findLatestByUser(userId),
      ]);
      void reply.code(200).send({
        features: [...features],
        paymentsEnabled,
        plan: latest?.plan ?? null,
        status: latest?.status ?? null,
      });
    },
  );
};
