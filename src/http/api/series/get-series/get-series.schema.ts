import { z } from "zod/v4";

export const GetSeriesParams = z.object({
  id: z.uuid(),
});
export type GetSeriesParams = z.infer<typeof GetSeriesParams>;
