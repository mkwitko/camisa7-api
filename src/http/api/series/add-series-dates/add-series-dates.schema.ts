import { z } from "zod/v4";
import { MatchResponse } from "@/http/api/matches/matches.schema";

export const AddSeriesDatesParams = z.object({
  id: z.uuid(),
});
export type AddSeriesDatesParams = z.infer<typeof AddSeriesDatesParams>;

/** ISO datetimes (with time-of-day — a `manual` series has no `time` of its own, each date carries its own). */
export const AddSeriesDatesBody = z.object({
  dates: z.array(z.string()).min(1),
});
export type AddSeriesDatesBody = z.infer<typeof AddSeriesDatesBody>;

export const AddSeriesDatesResponse = z.array(MatchResponse);
export type AddSeriesDatesResponse = z.infer<typeof AddSeriesDatesResponse>;
