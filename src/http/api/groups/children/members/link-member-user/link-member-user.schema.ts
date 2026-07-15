import { z } from "zod/v4";
import { GroupMemberResponse } from "../members.schema";

export const LinkMemberUserParams = z.object({
  id: z.uuid(),
  memberId: z.uuid(),
});
export type LinkMemberUserParams = z.infer<typeof LinkMemberUserParams>;

export const LinkMemberUserBody = z.object({
  email: z.email(),
});
export type LinkMemberUserBody = z.infer<typeof LinkMemberUserBody>;

export const MergeSummaryResponse = z.object({
  guestsMerged: z.number().int().min(0),
  membershipsMerged: z.number().int().min(0),
  attendancesMerged: z.number().int().min(0),
  statsMerged: z.number().int().min(0),
  votesMerged: z.number().int().min(0),
});
export type MergeSummaryResponse = z.infer<typeof MergeSummaryResponse>;

export const LinkMemberUserResponse = z.object({
  member: GroupMemberResponse,
  summary: MergeSummaryResponse,
});
export type LinkMemberUserResponse = z.infer<typeof LinkMemberUserResponse>;
