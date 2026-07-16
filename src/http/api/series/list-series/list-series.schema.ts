import { z } from "zod/v4";
import { SeriesResponse } from "../series.schema";

export const ListGroupSeriesParams = z.object({
  id: z.uuid(),
});
export type ListGroupSeriesParams = z.infer<typeof ListGroupSeriesParams>;

export const ListGroupSeriesResponse = z.array(SeriesResponse);
export type ListGroupSeriesResponse = z.infer<typeof ListGroupSeriesResponse>;
