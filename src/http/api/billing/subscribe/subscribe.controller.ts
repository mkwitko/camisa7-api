import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createAuthRepository } from "@/http/api/auth/auth.repository";
import { requireUser } from "@/http/hooks/auth";
import { prisma } from "@/infra/db/client";
import { createSubscriptionsRepository } from "../subscription.repository";
import { SubscribeBody, SubscribeResponse } from "./subscribe.schema";
import { createSubscribeService } from "./subscribe.service";

/**
 * `POST /billing/subscribe` (auth) — starts a Woovi PIX Automático
 * subscription for the chosen plan; see `subscribe.service.ts` for the full
 * create-then-charge-with-cleanup + resubscribe rationale. `operationId`
 * `subscribeBilling` avoids colliding with the (Task 6-removed) Stripe
 * `createBillingCheckout`.
 */
export const billingSubscribeRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().post(
    "/billing/subscribe",
    {
      schema: {
        operationId: "subscribeBilling",
        tags: ["billing"],
        body: SubscribeBody,
        response: { 200: SubscribeResponse },
      },
    },
    async (req, reply) => {
      const service = createSubscribeService({
        authRepo: createAuthRepository(prisma),
        subscriptionsRepo: createSubscriptionsRepository(prisma),
      });
      const { userId } = requireUser(req);
      const result = await service(userId, req.body);
      void reply.code(200).send(result);
    },
  );
};
