/**
 * Domain `MatchStatus` — mirrors the Prisma `MatchStatus` enum values as a
 * plain string union (same rationale as `GroupStatsMode`/`Position` in the
 * groups/members modules: callers don't depend on the generated Prisma
 * client's types). `open` is the only status `create-match` ever sets;
 * `full`/`closed` are set by Task 7's attendance flow, `finished` by a later
 * task once `datetime` has passed, `cancelled` by `cancel-match`.
 */
export type MatchStatus = "open" | "full" | "closed" | "finished" | "cancelled";

/**
 * `null` means a one-off match. `weekday` is 0 (Sunday) .. 6 (Saturday);
 * `time` is a "HH:mm" string. Validated at the HTTP boundary (Zod, see
 * `matches.schema.ts`) — the DB column is a plain `Json?`, no CHECK
 * constraint. Task 11's recurrence job reads this to spawn the next
 * occurrence once a `finished` match with this shape has no future sibling.
 */
export type RecurrenceRule = { weekly: true; weekday: number; time: string } | null;

/**
 * Domain `Match` — not the Prisma row. A scheduled pelada inside a `Group`;
 * only the group's owner manages it (`assertMatchOwner` in
 * `matches.authz.ts`). `datetime`/`createdAt` are ISO 8601 strings (see the
 * company skill's DATES.md — domain types carry `string`, not `Date`).
 */
export type Match = {
  id: string;
  groupId: string;
  datetime: string;
  location: string;
  priceCents: number;
  slots: number;
  pixKey: string | null;
  status: MatchStatus;
  recurrenceRule: RecurrenceRule;
  createdAt: string;
};
