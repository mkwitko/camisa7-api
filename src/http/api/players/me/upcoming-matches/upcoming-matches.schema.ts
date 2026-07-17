import { z } from "zod/v4";
import { MatchStatusSchema } from "@/http/api/matches/matches.schema";

export const UpcomingMatchResponse = z.object({
  id: z.uuid(),
  groupId: z.uuid(),
  groupName: z.string(),
  datetime: z.string(),
  location: z.string(),
  priceCents: z.number().int(),
  slots: z.number().int(),
  status: MatchStatusSchema,
  seriesId: z.uuid().nullable(),
  attendanceStatus: z.enum(["confirmed", "waitlisted"]).nullable(),
});
export type UpcomingMatchResponse = z.infer<typeof UpcomingMatchResponse>;

export const UpcomingMatchesResponse = z.array(UpcomingMatchResponse);
export type UpcomingMatchesResponse = z.infer<typeof UpcomingMatchesResponse>;
