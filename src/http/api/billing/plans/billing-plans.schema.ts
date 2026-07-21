import { z } from "zod/v4";

/** Preço resolvido ao vivo do Stripe. `interval` = `recurring.interval` (ex "month"). */
export const PlanPriceSchema = z.object({
  amountCents: z.number().int(),
  currency: z.string(),
  interval: z.string(),
});
export type PlanPriceSchema = z.infer<typeof PlanPriceSchema>;

/** Um plano vendável com features (união pra organizador), includes e preço. */
export const BillingPlanSchema = z.object({
  key: z.enum(["organizer", "player"]),
  features: z.array(z.string()),
  includes: z.enum(["organizer", "player"]).nullable(),
  price: PlanPriceSchema.nullable(),
});

export const BillingPlansResponse = z.object({
  plans: z.array(BillingPlanSchema),
});
export type BillingPlansResponse = z.infer<typeof BillingPlansResponse>;
