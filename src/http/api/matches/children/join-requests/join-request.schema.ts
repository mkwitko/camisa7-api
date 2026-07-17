import { z } from "zod/v4";

export const JoinRequestStatusSchema = z.enum(["pending", "approved", "rejected"]);

/** URL params for the two match-scoped routes (`POST /matches/:id/join-request`, `GET /matches/:id/join-requests`). */
export const JoinRequestParams = z.object({ id: z.uuid() });
export type JoinRequestParams = z.infer<typeof JoinRequestParams>;

/** URL params for the decision route (`POST /matches/:id/join-requests/:reqId/decision`). */
export const DecideJoinRequestParams = z.object({ id: z.uuid(), reqId: z.uuid() });
export type DecideJoinRequestParams = z.infer<typeof DecideJoinRequestParams>;

/** `approve: true` → confirm the requester + push; `false` → reject. */
export const DecideJoinRequestBody = z.object({ approve: z.boolean() });
export type DecideJoinRequestBody = z.infer<typeof DecideJoinRequestBody>;

/** The full request row returned by `requestJoin`/`decide`. */
export const JoinRequestResponse = z.object({
  id: z.uuid(),
  matchId: z.uuid(),
  playerId: z.uuid(),
  status: JoinRequestStatusSchema,
  decidedById: z.uuid().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type JoinRequestResponse = z.infer<typeof JoinRequestResponse>;

/** One pending request in the organizer's inbox (`GET /matches/:id/join-requests`). */
export const PendingJoinRequestResponse = z.object({
  id: z.uuid(),
  matchId: z.uuid(),
  playerId: z.uuid(),
  playerName: z.string(),
  createdAt: z.string(),
});

export const JoinRequestListResponse = z.array(PendingJoinRequestResponse);
export type JoinRequestListResponse = z.infer<typeof JoinRequestListResponse>;
