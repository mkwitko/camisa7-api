import type { FastifyPluginAsync } from "fastify";
import { billingMeRoute } from "./me/billing-me.controller";

/**
 * Registers the `billing` routes. `GET /billing/me` is authenticated;
 * checkout/portal (E5) are authenticated too, the Stripe webhook (E6) is
 * public (raw-body + signature). Config-gated by `STRIPE_SECRET_KEY`: with
 * billing off, `/billing/checkout|portal` return 503 and `/billing/me` yields
 * no features (reviewers excepted).
 */
export const billingRoutes: FastifyPluginAsync = async (app) => {
  await app.register(billingMeRoute);
};
