import { z } from "zod/v4";
import { PositionSchema } from "../members.schema";

export const UpdateMemberParams = z.object({
  id: z.uuid(),
  memberId: z.uuid(),
});
export type UpdateMemberParams = z.infer<typeof UpdateMemberParams>;

export const UpdateMemberBody = z.object({
  primaryPos: PositionSchema.optional(),
  secondaryPos: z.array(PositionSchema).optional(),
  affinity: z.partialRecord(PositionSchema, z.number()).optional(),
  seedOverall: z.partialRecord(PositionSchema, z.number()).optional(),
});
export type UpdateMemberBody = z.infer<typeof UpdateMemberBody>;
