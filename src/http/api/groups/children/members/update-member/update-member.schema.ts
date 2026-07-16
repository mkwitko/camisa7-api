import { z } from "zod/v4";
import { BillingModeSchema } from "@/http/api/dues/dues.schema";
import { AffinityValueSchema, PositionSchema, SeedOverallValueSchema } from "../members.schema";

export const UpdateMemberParams = z.object({
  id: z.uuid(),
  memberId: z.uuid(),
});
export type UpdateMemberParams = z.infer<typeof UpdateMemberParams>;

export const UpdateMemberBody = z.object({
  primaryPos: PositionSchema.optional(),
  secondaryPos: z.array(PositionSchema).optional(),
  affinity: z.partialRecord(PositionSchema, AffinityValueSchema).optional(),
  seedOverall: z.partialRecord(PositionSchema, SeedOverallValueSchema).optional(),
  billingMode: BillingModeSchema.optional(),
  monthlyFeeCentsOverride: z.number().int().min(0).nullable().optional(),
});
export type UpdateMemberBody = z.infer<typeof UpdateMemberBody>;
