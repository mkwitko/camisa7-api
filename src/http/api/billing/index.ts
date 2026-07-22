import type { FastifyPluginAsync } from "fastify";
import { billingCancelRoute } from "./cancel/cancel.controller";
import { billingMeRoute } from "./me/billing-me.controller";
import { billingPlansRoute } from "./plans/billing-plans.controller";
import { billingSubscribeRoute } from "./subscribe/subscribe.controller";
import { stripeWebhookRoute } from "./webhook/stripe-webhook.controller";

/**
 * Registers the `billing` routes. `GET /billing/me`, `POST
 * /billing/subscribe|cancel` are authenticated; the Stripe webhook is public
 * (raw-body + signature) — kept only for the Connect/bookings
 * `payment_intent.*` lifecycle (Task 6 removed checkout/portal and the
 * subscription/entitlements branch it used to also handle here).
 * `/billing/subscribe` 503s (`WOO.DISABLED`) when Woovi isn't configured;
 * `/billing/me` never 503s — billing-off simply yields no features/no
 * subscription (reviewers excepted).
 */
export const billingRoutes: FastifyPluginAsync = async (app) => {
  await app.register(billingMeRoute);
  await app.register(billingPlansRoute);
  await app.register(billingSubscribeRoute);
  await app.register(billingCancelRoute);
  await app.register(stripeWebhookRoute);
};
