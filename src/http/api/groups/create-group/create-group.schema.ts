import { z } from "zod/v4";
import { GroupStatsModeSchema } from "../groups.schema";

export const CreateGroupBody = z.object({
  name: z.string().min(1),
  statsMode: GroupStatsModeSchema.optional(),
});
export type CreateGroupBody = z.infer<typeof CreateGroupBody>;
