import { z } from "zod/v4";

/**
 * `POST /billing/subscribe` body. `taxId` is the subscriber's CPF (any
 * formatting accepted — the service strips non-digits and requires 11);
 * `phone` is passed through to Woovi's `customer.phone` as-is. Both are
 * persisted on the `User` (`billingTaxId`/`phone`) for reuse.
 */
export const SubscribeBody = z.object({
  plan: z.enum(["organizer", "player"]),
  taxId: z.string(),
  phone: z.string(),
});
export type SubscribeBody = z.infer<typeof SubscribeBody>;

/**
 * `POST /billing/subscribe` response. `status` is always `"pending"` right
 * after this call — it only becomes `"active"` once the `PIX_AUTOMATIC_APPROVED`
 * webhook lands. `emv` is the PIX Automático QR/copia-e-cola the app shows
 * for the user to approve in their bank app.
 */
export const SubscribeResponse = z.object({
  subscriptionId: z.string(),
  status: z.enum(["pending", "active", "expired", "canceled"]),
  emv: z.string(),
});
export type SubscribeResponse = z.infer<typeof SubscribeResponse>;
