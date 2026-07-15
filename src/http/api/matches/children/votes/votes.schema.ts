import { z } from "zod/v4";

// Shared response shapes for cast-vote/list-vote-tally — see the company
// skill's ARCHITECTURE.md §3.6 ("recursos filhos do agregado").
export const VoteCategorySchema = z.enum(["mvp", "melhor_goleiro", "craque", "fair_play"]);

export const VoteResponse = z.object({
  id: z.uuid(),
  matchId: z.uuid(),
  voterPlayerId: z.uuid(),
  category: VoteCategorySchema,
  votedPlayerId: z.uuid(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type VoteResponse = z.infer<typeof VoteResponse>;

export const CategoryTallyEntryResponse = z.object({
  playerId: z.uuid(),
  votes: z.number().int().min(0),
});
export type CategoryTallyEntryResponse = z.infer<typeof CategoryTallyEntryResponse>;

export const CategoryTallyResponse = z.object({
  category: VoteCategorySchema,
  tally: z.array(CategoryTallyEntryResponse),
  leaderPlayerId: z.uuid().nullable(),
});
export type CategoryTallyResponse = z.infer<typeof CategoryTallyResponse>;

export const VoteTallyResponse = z.array(CategoryTallyResponse);
export type VoteTallyResponse = z.infer<typeof VoteTallyResponse>;
