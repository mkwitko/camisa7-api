import type { Player } from "@/http/api/players/players.types";

/**
 * Domain `AttendanceStatus` — mirrors the Prisma `AttendanceStatus` enum
 * values as a plain string union (same rationale as `MatchStatus`/`Position`
 * elsewhere: callers don't depend on the generated Prisma client's types).
 * `cancelled` is terminal — a cancelled row is never reused; re-confirming
 * the same player on the same match inserts a fresh row (the partial unique
 * index only blocks a *second active* row, see the `Attendance` model's doc
 * comment in `schema.prisma`).
 */
export type AttendanceStatus = "confirmed" | "waitlisted" | "cancelled";

/** Domain `PaymentStatus` — mirrors the Prisma `PaymentStatus` enum values. */
export type PaymentStatus = "pending" | "paid";

/**
 * Domain `Attendance` — not the Prisma row. A `Player`'s slot/waitlist state
 * for one `Match`, flattened with the `Player` (same pattern as `GroupMember`
 * in `members.types.ts`). Every state transition happens inside
 * `attendance.repository.ts`'s locked `$transaction` — see that file's doc
 * comment for the race-safety argument.
 */
export type Attendance = {
  id: string;
  matchId: string;
  player: Player;
  status: AttendanceStatus;
  waitlistPos: number | null;
  paymentStatus: PaymentStatus;
  paidConfirmedById: string | null;
};
