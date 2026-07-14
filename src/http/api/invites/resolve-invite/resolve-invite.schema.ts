import { z } from "zod/v4";
import { MatchStatusSchema } from "@/http/api/matches/matches.schema";

export const ResolveInviteParams = z.object({ token: z.string().min(1) });
export type ResolveInviteParams = z.infer<typeof ResolveInviteParams>;

// Deliberately narrow: only the match core a guest needs to decide whether
// to show up, the parent group's NAME (not its member list), and aggregate
// counts. MUST NEVER include `GroupMember` fields (`seedOverall`, `affinity`,
// `primaryPos`, ...) — see `resolve-invite.service.ts`, which never queries
// `GroupMember` at all, so there's nothing rating-shaped to leak even before
// this schema (whose declared fields the serializer prunes to) is reached.
export const ResolveInviteResponse = z.object({
  matchId: z.uuid(),
  groupName: z.string(),
  datetime: z.string(),
  location: z.string(),
  priceCents: z.number().int(),
  slots: z.number().int(),
  pixKey: z.string().nullable(),
  status: MatchStatusSchema,
  confirmedCount: z.number().int(),
  waitlistCount: z.number().int(),
});
export type ResolveInviteResponse = z.infer<typeof ResolveInviteResponse>;
