import { z } from "zod/v4";
import { AffinityValueSchema, PositionSchema, SeedOverallValueSchema } from "../members.schema";

export const AddMemberParams = z.object({
  id: z.uuid(),
});
export type AddMemberParams = z.infer<typeof AddMemberParams>;

export const AddMemberBody = z.object({
  name: z.string().min(1),
  phone: z.string().min(1).optional(),
  primaryPos: PositionSchema,
  secondaryPos: z.array(PositionSchema).optional(),
  affinity: z.partialRecord(PositionSchema, AffinityValueSchema).optional(),
  seedOverall: z.partialRecord(PositionSchema, SeedOverallValueSchema).optional(),
});
export type AddMemberBody = z.infer<typeof AddMemberBody>;
