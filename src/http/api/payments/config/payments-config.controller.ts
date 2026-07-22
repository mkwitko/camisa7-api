import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod/v4";
import { isWooviConfigured } from "@/infra/woovi/client";

const PaymentsConfigResponse = z.object({ enabled: z.boolean() });

/**
 * `GET /payments/config` (auth) — tells the app whether in-app Woovi PIX
 * payments (`pay-attendance`/`pay-due`) are available on this deploy, so it
 * can hide that UI instead of the caller hitting `WOO-T0001` (503) on every
 * `pay` attempt. Mirrors `GET /billing/me`'s "never 503, config-off just
 * yields the disabled state" shape.
 */
export const paymentsConfigRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().get(
    "/payments/config",
    {
      schema: {
        operationId: "getPaymentsConfig",
        tags: ["payments"],
        response: { 200: PaymentsConfigResponse },
      },
    },
    async (_req, reply) => {
      void reply.code(200).send({ enabled: isWooviConfigured });
    },
  );
};
