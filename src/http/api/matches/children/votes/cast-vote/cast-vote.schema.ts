import { z } from "zod/v4";
import { VoteCategorySchema } from "../votes.schema";

export const CastVoteParams = z.object({ id: z.uuid() });
export type CastVoteParams = z.infer<typeof CastVoteParams>;

export const CastVoteBody = z.object({
  category: VoteCategorySchema,
  votedPlayerId: z.uuid(),
});
export type CastVoteBody = z.infer<typeof CastVoteBody>;
