import { z } from "zod/v4";

/**
 * `GET /billing/me` response. `features` are the entitlement `lookup_key`s the
 * caller currently has (reviewer accounts get all of them). `paymentsEnabled`
 * is `false` for reviewer accounts — the app hides every in-app payment
 * surface when it's false. `plan`/`status` reflect the caller's most recent
 * `Subscription` (`findLatestByUser`) — both `null` if the user has never
 * subscribed.
 */
export const BillingMeResponse = z.object({
  features: z.array(z.string()),
  paymentsEnabled: z.boolean(),
  plan: z.enum(["organizer", "player"]).nullable(),
  status: z.enum(["pending", "active", "expired", "canceled"]).nullable(),
});
export type BillingMeResponse = z.infer<typeof BillingMeResponse>;
