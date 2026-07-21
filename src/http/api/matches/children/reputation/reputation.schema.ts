import { z } from "zod/v4";
import { REPUTATION_DIMENSIONS } from "./reputation.types";

export const ReputationDimensionSchema = z.enum(REPUTATION_DIMENSIONS);
export const ReputationParams = z.object({ id: z.uuid() });
export type ReputationParams = z.infer<typeof ReputationParams>;

export const VoterTagSchema = z.object({
  votedPlayerId: z.uuid(),
  dimensions: z.array(ReputationDimensionSchema).max(REPUTATION_DIMENSIONS.length),
});

export const SetReputationBody = z.object({ tags: z.array(VoterTagSchema).max(64) });
export type SetReputationBody = z.infer<typeof SetReputationBody>;

export const ReputationResponse = z.object({ tags: z.array(VoterTagSchema) });
export type ReputationResponse = z.infer<typeof ReputationResponse>;
