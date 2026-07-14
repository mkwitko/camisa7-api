import { z } from "zod/v4";

export const FinishMatchParams = z.object({
  id: z.uuid(),
});
export type FinishMatchParams = z.infer<typeof FinishMatchParams>;
