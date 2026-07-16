import { z } from "zod/v4";

export const DueStatusSchema = z.enum(["pending", "paid"]);
export const DueProviderSchema = z.enum(["manual", "stripe"]);
export const BillingModeSchema = z.enum(["mensalista", "avulso"]);
export const DueResponse = z.object({
  id: z.uuid(),
  groupMemberId: z.uuid(),
  competencyMonth: z.string(),
  amountCents: z.number().int(),
  status: DueStatusSchema,
  paidConfirmedById: z.uuid().nullable(),
  provider: DueProviderSchema,
  externalRef: z.string().nullable(),
  createdAt: z.string(),
});
export type DueResponse = z.infer<typeof DueResponse>;
