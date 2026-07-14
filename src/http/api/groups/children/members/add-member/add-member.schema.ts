import { z } from "zod/v4";
import { PositionSchema } from "../members.schema";

export const AddMemberParams = z.object({
  id: z.uuid(),
});
export type AddMemberParams = z.infer<typeof AddMemberParams>;

export const AddMemberBody = z.object({
  name: z.string().min(1),
  phone: z.string().min(1).optional(),
  primaryPos: PositionSchema,
  secondaryPos: z.array(PositionSchema).optional(),
  affinity: z.partialRecord(PositionSchema, z.number()).optional(),
  seedOverall: z.partialRecord(PositionSchema, z.number()).optional(),
});
export type AddMemberBody = z.infer<typeof AddMemberBody>;
