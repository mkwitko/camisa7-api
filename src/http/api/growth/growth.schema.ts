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
