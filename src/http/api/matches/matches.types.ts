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
 * Domain `Match` — not the Prisma row. A scheduled pelada inside a `Group`;
 * only the group's owner manages it (`assertMatchOwner` in
 * `matches.authz.ts`). `datetime`/`createdAt` are ISO 8601 strings (see the
 * company skill's DATES.md — domain types carry `string`, not `Date`).
 * `seriesId` links a spawned occurrence back to its `MatchSeries` (Motor de
 * Recorrência) — `null` means a one-off match. `detached` lets an organizer
 * edit/cancel a single occurrence without affecting the rest of the series
 * (the recurrence job skips detached matches).
 */
export type Match = {
  id: string;
  groupId: string;
  seriesId: string | null;
  detached: boolean;
  datetime: string;
  location: string;
  priceCents: number;
  slots: number;
  pixKey: string | null;
  status: MatchStatus;
  createdAt: string;
};
