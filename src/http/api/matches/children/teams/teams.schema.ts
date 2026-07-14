import { z } from "zod/v4";

// Shared response shape for generate/update-teams — see the company skill's
// ARCHITECTURE.md §3.6 ("recursos filhos do agregado").
export const TeamPlayerResponse = z.object({
  playerId: z.uuid(),
  name: z.string(),
});
export type TeamPlayerResponse = z.infer<typeof TeamPlayerResponse>;

export const TeamSplitResponse = z.object({
  team: z.number().int().min(0),
  players: z.array(TeamPlayerResponse),
});
export type TeamSplitResponse = z.infer<typeof TeamSplitResponse>;

export const TeamAssignmentResponse = z.object({
  matchId: z.uuid(),
  teams: z.array(TeamSplitResponse),
  generatedAt: z.string(),
});
export type TeamAssignmentResponse = z.infer<typeof TeamAssignmentResponse>;
