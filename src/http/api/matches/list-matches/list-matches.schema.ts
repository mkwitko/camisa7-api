import { z } from "zod/v4";
import { MatchResponse } from "../matches.schema";

export const ListMatchesParams = z.object({
  id: z.uuid(),
});
export type ListMatchesParams = z.infer<typeof ListMatchesParams>;

// Query params always arrive as strings; "true" is the only value that turns
// the flag on (anything else, including absent, defaults to false).
export const ListMatchesQuery = z.object({
  includeFinished: z
    .string()
    .optional()
    .transform((value) => value === "true"),
});
export type ListMatchesQuery = z.infer<typeof ListMatchesQuery>;

export const ListMatchesResponse = z.array(MatchResponse);
export type ListMatchesResponse = z.infer<typeof ListMatchesResponse>;
