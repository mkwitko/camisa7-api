import { z } from "zod/v4";

// Shared response shape for log-stats/list-stats — see the backend conventions
// ARCHITECTURE.md §3.6 ("recursos filhos do agregado").
export const MatchStatSourceSchema = z.enum(["organizador", "colaborativo"]);

export const MatchStatResponse = z.object({
  id: z.uuid(),
  matchId: z.uuid(),
  playerId: z.uuid(),
  team: z.number().int().min(0).nullable(),
  goals: z.number().int().min(0),
  assists: z.number().int().min(0),
  ownGoals: z.number().int().min(0),
  cleanSheet: z.boolean(),
  source: MatchStatSourceSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type MatchStatResponse = z.infer<typeof MatchStatResponse>;
