import { z } from "zod/v4";

export const FinalizeMatchParams = z.object({
  id: z.uuid(),
});
export type FinalizeMatchParams = z.infer<typeof FinalizeMatchParams>;
