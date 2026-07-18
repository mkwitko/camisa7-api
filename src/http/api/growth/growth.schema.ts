import { z } from "zod/v4";

/**
 * `GET /api/growth/metrics` querystring — the `[from, to)` window (half-open:
 * `from` inclusive, `to` exclusive) the counts below are aggregated over.
 * Both are full ISO-8601 datetimes (`z.iso.datetime()`, e.g.
 * `2026-07-16T00:00:00Z`) — the growth-os pipeline is the only caller and
 * always sends both.
 */
export const GrowthMetricsQuery = z.object({
  from: z.iso.datetime(),
  to: z.iso.datetime(),
});
export type GrowthMetricsQuery = z.infer<typeof GrowthMetricsQuery>;

/**
 * Per-city growth entry. `growthPct` compares new-user counts (by
 * `User.lastCity`) in the requested window vs. the immediately-preceding
 * equal-length window; `100` when the previous window had zero users for
 * that city (see `growth.controller.ts`).
 */
export const GrowthCityMetric = z.object({
  name: z.string(),
  growthPct: z.number(),
});
export type GrowthCityMetric = z.infer<typeof GrowthCityMetric>;

export const GrowthMetricsResponse = z.object({
  matches: z.number().int(),
  goals: z.number().int(),
  newGroups: z.number().int(),
  newUsers: z.number().int(),
  cities: z.array(GrowthCityMetric),
});
export type GrowthMetricsResponse = z.infer<typeof GrowthMetricsResponse>;

/**
 * `GET /api/growth/content-feed` querystring — same `[from, to)` half-open
 * window convention as `GrowthMetricsQuery`.
 */
export const GrowthContentFeedQuery = z.object({
  from: z.iso.datetime(),
  to: z.iso.datetime(),
});
export type GrowthContentFeedQuery = z.infer<typeof GrowthContentFeedQuery>;

/**
 * One match created in the window, ranked by summed `MatchStat.goals`
 * (top 5). `city` is `Match.city` (nullable on the model — surfaced as-is,
 * `null` when the organizer never set it); `groupName` is the owning
 * `Group.name` via `Match.group`.
 */
export const GrowthTopMatch = z.object({
  id: z.uuid(),
  city: z.string().nullable(),
  goals: z.number().int(),
  groupName: z.string(),
});
export type GrowthTopMatch = z.infer<typeof GrowthTopMatch>;

/**
 * A group whose member count crossed a round threshold (50/100/…) inside the
 * window. NOT YET IMPLEMENTED — `Group` has no `city` field (only `Match`
 * does, and a group's matches can span several cities), so a milestone's
 * `city` isn't cheaply derivable from the schema as-is; the controller
 * always returns `[]` for now (see the `// TODO` there). Shape kept here so
 * wiring it up later doesn't require a response-schema change.
 */
export const GrowthMilestone = z.object({
  groupName: z.string(),
  city: z.string().nullable(),
  members: z.number().int(),
});
export type GrowthMilestone = z.infer<typeof GrowthMilestone>;

export const GrowthContentFeedResponse = z.object({
  range: z.object({ from: z.iso.datetime(), to: z.iso.datetime() }),
  topMatches: z.array(GrowthTopMatch),
  milestones: z.array(GrowthMilestone),
  hotCity: GrowthCityMetric.nullable(),
  totals: z.object({
    matches: z.number().int(),
    goals: z.number().int(),
    newGroups: z.number().int(),
    newUsers: z.number().int(),
  }),
});
export type GrowthContentFeedResponse = z.infer<typeof GrowthContentFeedResponse>;
