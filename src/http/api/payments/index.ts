import type { FastifyPluginAsync } from "fastify";
import { paymentsConfigRoute } from "./config/payments-config.controller";
import { wooviWebhookRoute } from "./webhook/woovi-webhook.controller";

/** Registers the `payments` routes: `GET /payments/config` (auth) and `POST /webhooks/woovi` (public, raw-body). */
export const paymentsRoutes: FastifyPluginAsync = async (app) => {
  await app.register(paymentsConfigRoute);
  await app.register(wooviWebhookRoute);
};
