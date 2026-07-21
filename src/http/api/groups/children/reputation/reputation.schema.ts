import { z } from "zod/v4";

export const GroupReputationParams = z.object({ id: z.uuid() });
export type GroupReputationParams = z.infer<typeof GroupReputationParams>;

// Mirrors `ReputationCounts` (`matches/children/reputation/reputation.types.ts`)
// as a literal Zod shape at the HTTP boundary — same pattern
// `public-profile.schema.ts`'s `reputation` field uses.
const ReputationCountsSchema = z.object({
  pontualidade: z.number().int().min(0),
  educacao: z.number().int().min(0),
  compromisso: z.number().int().min(0),
  respeito: z.number().int().min(0),
});

const GroupMemberReputationRow = z.object({
  playerId: z.uuid(),
  name: z.string(),
  reputation: ReputationCountsSchema,
});

export const GroupReputationResponse = z.object({
  members: z.array(GroupMemberReputationRow),
});
export type GroupReputationResponse = z.infer<typeof GroupReputationResponse>;
