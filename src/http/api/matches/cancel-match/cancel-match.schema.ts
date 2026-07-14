import { z } from "zod/v4";

export const CancelMatchParams = z.object({
  id: z.uuid(),
});
export type CancelMatchParams = z.infer<typeof CancelMatchParams>;
