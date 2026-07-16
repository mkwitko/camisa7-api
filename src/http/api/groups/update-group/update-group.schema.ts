import { z } from "zod/v4";

export const UpdateGroupParams = z.object({
  id: z.uuid(),
});
export type UpdateGroupParams = z.infer<typeof UpdateGroupParams>;

export const UpdateGroupBody = z.object({
  monthlyFeeCents: z.number().int().min(0).nullable().optional(),
});
export type UpdateGroupBody = z.infer<typeof UpdateGroupBody>;
