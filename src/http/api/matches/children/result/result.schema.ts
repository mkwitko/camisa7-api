import { z } from "zod/v4";

// Shared response/body shapes for record/get-result — see the backend conventions
// ARCHITECTURE.md §3.6 ("recursos filhos do agregado").
export const TeamScoreSchema = z.object({
  team: z.number().int().min(0),
  goals: z.number().int().min(0),
});
export type TeamScoreSchema = z.infer<typeof TeamScoreSchema>;

export const MatchResultResponse = z.object({
  matchId: z.uuid(),
  scores: z.array(TeamScoreSchema),
  winnerTeam: z.number().int().min(0).nullable(),
  recordedById: z.uuid(),
  recordedAt: z.string(),
});
export type MatchResultResponse = z.infer<typeof MatchResultResponse>;
