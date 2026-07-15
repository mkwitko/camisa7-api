import { z } from "zod/v4";
import { TeamScoreSchema } from "../result.schema";

export const RecordResultParams = z.object({ id: z.uuid() });
export type RecordResultParams = z.infer<typeof RecordResultParams>;

// `winnerTeam` is optional: omitted, the service derives it from `scores`
// (the team with the most goals; tied max -> draw). Given explicitly, it's
// validated against `scores`/the match's teams in the service — `null` means
// an explicit draw.
export const RecordResultBody = z.object({
  scores: z.array(TeamScoreSchema).min(1),
  winnerTeam: z.number().int().min(0).nullable().optional(),
});
export type RecordResultBody = z.infer<typeof RecordResultBody>;
