import type { BillingMode } from "@/http/api/dues/dues.types";
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

/**
 * Domain `MonthlyDueStatus` — DERIVED membership-dues coverage for one
 * attendee, computed per-request by `list-attendance.service.ts` from the
 * match's group `GroupMember.billingMode` and (if `mensalista`) that
 * group/month's `MembershipDue`. Never persisted on `Attendance` itself.
 * `"none"`: the player is `avulso` in this group — dues don't apply, the
 * app should keep showing the per-match `paymentStatus`/PIX chip instead.
 * `"paid"`/`"pending"`: the player is `mensalista` — mirrors `DueStatus`,
 * with a missing due for the month (not yet generated, e.g. mid-month
 * signup) treated the same as `"pending"` (owed, not paid).
 */
export type MonthlyDueStatus = "paid" | "pending" | "none";

/**
 * `Attendance` enriched with the player's group billing context. Kept
 * separate from `Attendance` (rather than adding the fields there) so only
 * `list-attendance` — the one endpoint the app renders "mensalista • mês
 * pago/devendo" from — carries this extra join; `confirm-presence`,
 * `cancel-presence`, `mark-paid` and `confirm-payment` keep returning the
 * plain `Attendance` shape via `presentAttendance`.
 */
export type AttendanceListItem = Attendance & {
  billingMode: BillingMode;
  monthlyDueStatus: MonthlyDueStatus;
};
