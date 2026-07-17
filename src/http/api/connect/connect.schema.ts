import { z } from "zod/v4";

/** `POST /connect/account` response — the Stripe-hosted Account Link URL to open. */
export const ConnectAccountLinkResponse = z.object({
  url: z.url(),
});
export type ConnectAccountLinkResponse = z.infer<typeof ConnectAccountLinkResponse>;

/**
 * `GET /connect/status` response — live Connect status for the caller.
 * `hasAccount:false` (onboarding never started) always pairs with every
 * other field at its "nothing yet" default (`false`/`[]`), never a mix.
 */
export const ConnectStatusResponse = z.object({
  hasAccount: z.boolean(),
  chargesEnabled: z.boolean(),
  payoutsEnabled: z.boolean(),
  detailsSubmitted: z.boolean(),
  requirementsDue: z.array(z.string()),
});
export type ConnectStatusResponse = z.infer<typeof ConnectStatusResponse>;
