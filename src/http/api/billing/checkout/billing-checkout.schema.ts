import { z } from "zod/v4";

/** `POST /billing/checkout` body — which subscription plan to start. */
export const BillingCheckoutBody = z.object({
  plan: z.enum(["organizer", "player"]),
});
export type BillingCheckoutBody = z.infer<typeof BillingCheckoutBody>;

/** Both checkout and portal return a hosted Stripe URL for the app to open. */
export const BillingUrlResponse = z.object({
  url: z.string(),
});
export type BillingUrlResponse = z.infer<typeof BillingUrlResponse>;
