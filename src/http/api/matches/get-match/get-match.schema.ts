import { z } from "zod/v4";

export const GetMatchParams = z.object({
  id: z.uuid(),
});
export type GetMatchParams = z.infer<typeof GetMatchParams>;
