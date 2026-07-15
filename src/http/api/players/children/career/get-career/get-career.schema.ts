import { z } from "zod/v4";

export const GetCareerParams = z.object({
  playerId: z.uuid(),
});
export type GetCareerParams = z.infer<typeof GetCareerParams>;
