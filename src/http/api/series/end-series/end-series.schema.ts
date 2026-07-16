import { z } from "zod/v4";

export const EndSeriesParams = z.object({
  id: z.uuid(),
});
export type EndSeriesParams = z.infer<typeof EndSeriesParams>;
