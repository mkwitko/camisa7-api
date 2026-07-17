/**
 * Domain `JoinRequestStatus` — mirrors the Prisma `JoinRequestStatus` enum
 * values as a plain string union (same rationale as `AttendanceStatus`/
 * `MatchStatus`: callers don't depend on the generated Prisma client types).
 */
export type JoinRequestStatus = "pending" | "approved" | "rejected";

/**
 * Domain `JoinRequest` — not the Prisma row. A stranger's request to join one
 * `Match` of a PUBLIC group whose `joinPolicy` is `request`. `decidedById` is
 * the acting owner `User.id` once decided (null while `pending`).
 */
export type JoinRequest = {
  id: string;
  matchId: string;
  playerId: string;
  status: JoinRequestStatus;
  decidedById: string | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * A `pending` `JoinRequest` enriched with the requesting player's display
 * name — the shape the organizer's inbox (`GET /matches/:id/join-requests`)
 * renders. Kept separate from `JoinRequest` so only that one listing carries
 * the extra `Player` join.
 */
export type PendingJoinRequest = {
  id: string;
  matchId: string;
  playerId: string;
  playerName: string;
  createdAt: string;
};
