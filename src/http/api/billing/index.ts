import type { FastifyPluginAsync } from "fastify";
import { billingCancelRoute } from "./cancel/cancel.controller";
import { billingCheckoutRoute } from "./checkout/billing-checkout.controller";
import { billingMeRoute } from "./me/billing-me.controller";
import { billingPlansRoute } from "./plans/billing-plans.controller";
import { billingPortalRoute } from "./portal/billing-portal.controller";
import { billingSubscribeRoute } from "./subscribe/subscribe.controller";
import { stripeWebhookRoute } from "./webhook/stripe-webhook.controller";

/**
 * Registers the `billing` routes. `GET /billing/me`, `POST
 * /billing/subscribe|cancel` are authenticated; checkout/portal (legacy
 * Stripe, removed in Task 6) are authenticated too, the Stripe webhook is
 * public (raw-body + signature). `/billing/subscribe` 503s (`WOO.DISABLED`)
 * when Woovi isn't configured; `/billing/me` never 503s — billing-off simply
 * yields no features/no subscription (reviewers excepted).
 */
export const billingRoutes: FastifyPluginAsync = async (app) => {
  await app.register(billingMeRoute);
  await app.register(billingPlansRoute);
  await app.register(billingSubscribeRoute);
  await app.register(billingCancelRoute);
  await app.register(billingCheckoutRoute);
  await app.register(billingPortalRoute);
  await app.register(stripeWebhookRoute);
};
