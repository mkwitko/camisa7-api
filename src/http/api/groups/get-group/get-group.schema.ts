import { z } from "zod/v4";

export const GetGroupParams = z.object({
  id: z.uuid(),
});
export type GetGroupParams = z.infer<typeof GetGroupParams>;
