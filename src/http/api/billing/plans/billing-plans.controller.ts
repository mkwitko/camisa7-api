import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { BillingPlansResponse } from "./billing-plans.schema";
import { createBillingPlansService } from "./list-plans.service";

/**
 * `GET /billing/plans` (público) — planos vendáveis com features (união pro
 * organizador), marcador `includes` e preço ao vivo do Stripe. Nunca 503:
 * billing off ⇒ preços `null`, a lista continua vindo pra montar a tela.
 */
export const billingPlansRoute: FastifyPluginAsync = async (app) => {
  const service = createBillingPlansService();
  app.withTypeProvider<ZodTypeProvider>().get(
    "/billing/plans",
    {
      schema: {
        operationId: "listBillingPlans",
        tags: ["billing"],
        response: { 200: BillingPlansResponse },
      },
    },
    async (_req, reply) => {
      const plans = await service.list();
      void reply.code(200).send({ plans });
    },
  );
};
