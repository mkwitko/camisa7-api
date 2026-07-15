import { z } from "zod/v4";

export const ListStatsParams = z.object({ id: z.uuid() });
export type ListStatsParams = z.infer<typeof ListStatsParams>;
