import { z } from "zod/v4";

// `phone` is the ENTIRE claim signal for F1-5 (see `claim-player.service.ts`'s
// doc comment for the security caveat) — no token/OTP field, deliberately,
// for this Fase 1 MVP.
export const ClaimPlayerBody = z.object({
  phone: z.string().min(1),
});
export type ClaimPlayerBody = z.infer<typeof ClaimPlayerBody>;

export const ClaimPlayerPlayerResponse = z.object({
  id: z.uuid(),
  userId: z.string().nullable(),
  name: z.string(),
  phone: z.string().nullable(),
});
export type ClaimPlayerPlayerResponse = z.infer<typeof ClaimPlayerPlayerResponse>;

export const ClaimSummaryResponse = z.object({
  guestsMerged: z.number().int().min(0),
  membershipsMerged: z.number().int().min(0),
  attendancesMerged: z.number().int().min(0),
  statsMerged: z.number().int().min(0),
  votesMerged: z.number().int().min(0),
});
export type ClaimSummaryResponse = z.infer<typeof ClaimSummaryResponse>;

export const ClaimPlayerResponse = z.object({
  player: ClaimPlayerPlayerResponse,
  summary: ClaimSummaryResponse,
});
export type ClaimPlayerResponse = z.infer<typeof ClaimPlayerResponse>;
