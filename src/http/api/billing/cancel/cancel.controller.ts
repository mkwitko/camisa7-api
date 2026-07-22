import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod/v4";
import { requireUser } from "@/http/hooks/auth";
import { prisma } from "@/infra/db/client";
import { createSubscriptionsRepository } from "../subscription.repository";
import { createCancelSubscriptionService } from "./cancel.service";

/** `POST /billing/cancel` response — always `{ canceled: true }` on success. */
const CancelBillingResponse = z.object({ canceled: z.literal(true) });

/**
 * `POST /billing/cancel` (auth) — cancels the caller's active/pending
 * subscription; see `cancel.service.ts`. `operationId` `cancelBilling` avoids
 * colliding with the Woovi Fase-1 `cancelSubscription` gateway function name.
 */
export const billingCancelRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().post(
    "/billing/cancel",
    {
      schema: {
        operationId: "cancelBilling",
        tags: ["billing"],
        response: { 200: CancelBillingResponse },
      },
    },
    async (req, reply) => {
      const service = createCancelSubscriptionService({
        subscriptionsRepo: createSubscriptionsRepository(prisma),
      });
      const { userId } = requireUser(req);
      const result = await service(userId);
      void reply.code(200).send(result);
    },
  );
};
