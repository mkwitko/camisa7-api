import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { env } from "@/config/env";
import { prisma } from "@/infra/db/client";
import { ERRORS } from "@/shared/errors/catalog";
import {
  GrowthContentFeedQuery,
  GrowthContentFeedResponse,
  GrowthMetricsQuery,
  GrowthMetricsResponse,
} from "./growth.schema";

const BEARER_PREFIX = "Bearer ";

/** Half-open `[from, to)` window shared by every growth aggregate below. */
type Window = { from: Date; to: Date };

function assertGrowthAuthorized(authorization: string | undefined): void {
  const token = env.GROWTH_SERVICE_TOKEN;
  if (!token) throw ERRORS.GRW.DISABLED();
  if (authorization !== `${BEARER_PREFIX}${token}`) throw ERRORS.GRW.UNAUTHORIZED();
}

/**
 * Counts `Match`/`Group`/`User` rows created in the window (half-open:
 * `from` inclusive, `to` exclusive), plus `goals` — the sum of the
 * per-player `MatchStat.goals` logged against matches created in that same
 * window (`MatchStat.match` is the relation field). Shared by
 * `/api/growth/metrics` and `/api/growth/content-feed`'s `totals`.
 */
async function computeTotals({
  from,
  to,
}: Window): Promise<{ matches: number; goals: number; newGroups: number; newUsers: number }> {
  const createdInWindow = { createdAt: { gte: from, lt: to } };
  const [matches, newGroups, newUsers, goalsAgg] = await Promise.all([
    prisma.match.count({ where: createdInWindow }),
    prisma.group.count({ where: createdInWindow }),
    prisma.user.count({ where: createdInWindow }),
    prisma.matchStat.aggregate({
      _sum: { goals: true },
      where: { match: createdInWindow },
    }),
  ]);
  return { matches, goals: goalsAgg._sum.goals ?? 0, newGroups, newUsers };
}

/**
 * Ranks the top 5 cities by new-user growth (current window vs. the
 * immediately-preceding equal-length window), keyed off `User.lastCity`.
 * Shared by `/api/growth/metrics`'s `cities` and `/api/growth/content-feed`'s
 * `hotCity` (its first/top entry, or `null` when no city had any new users
 * in-window).
 */
async function computeCityGrowth({ from, to }: Window): Promise<GrowthMetricsResponse["cities"]> {
  const createdInWindow = { createdAt: { gte: from, lt: to } };

  // Previous equal-length window, immediately preceding `from` — the
  // baseline this growth % is computed against.
  const windowMs = to.getTime() - from.getTime();
  const prevFrom = new Date(from.getTime() - windowMs);
  const prevTo = from;

  const [currentCityCounts, prevCityCounts] = await Promise.all([
    prisma.user.groupBy({
      by: ["lastCity"],
      where: { ...createdInWindow, lastCity: { not: null } },
      _count: { _all: true },
    }),
    prisma.user.groupBy({
      by: ["lastCity"],
      where: { createdAt: { gte: prevFrom, lt: prevTo }, lastCity: { not: null } },
      _count: { _all: true },
    }),
  ]);

  const prevCountByCity = new Map(
    prevCityCounts.map((row) => [row.lastCity as string, row._count._all]),
  );
  return currentCityCounts
    .map((row) => {
      const name = row.lastCity as string;
      const curCount = row._count._all;
      const prevCount = prevCountByCity.get(name) ?? 0;
      const growthPct =
        prevCount === 0 ? 100 : Math.round(((curCount - prevCount) / prevCount) * 1000) / 10;
      return { name, growthPct, curCount };
    })
    .sort((a, b) => b.curCount - a.curCount)
    .slice(0, 5)
    .map(({ name, growthPct }) => ({ name, growthPct }));
}

/**
 * `GET /api/growth/metrics` and `GET /api/growth/content-feed` —
 * server-to-server endpoints consumed by the growth-os reporting pipeline.
 * NOT gated by the regular JWT `authHook` (`config: { public: true }` opts
 * them out, per `src/http/hooks/auth.ts`) — instead each is gated by its own
 * shared-secret bearer token (`GROWTH_SERVICE_TOKEN`), checked here.
 * `GROWTH_SERVICE_TOKEN` unset on this deploy -> 503 (`GRW.DISABLED`, same
 * config-gated-feature convention as `BIL.DISABLED`/`CON.DISABLED`);
 * missing/mismatched `Authorization: Bearer <token>` -> 401
 * (`GRW.UNAUTHORIZED`).
 */
export const growthRoutes: FastifyPluginAsync = async (app) => {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    "/api/growth/metrics",
    {
      schema: {
        operationId: "getGrowthMetrics",
        tags: ["growth"],
        querystring: GrowthMetricsQuery,
        response: { 200: GrowthMetricsResponse },
      },
      config: { public: true },
    },
    async (req, reply) => {
      assertGrowthAuthorized(req.headers.authorization);

      const from = new Date(req.query.from);
      const to = new Date(req.query.to);

      const [totals, cities] = await Promise.all([
        computeTotals({ from, to }),
        computeCityGrowth({ from, to }),
      ]);

      void reply.code(200).send({ ...totals, cities });
    },
  );

  typed.get(
    "/api/growth/content-feed",
    {
      schema: {
        operationId: "getGrowthContentFeed",
        tags: ["growth"],
        querystring: GrowthContentFeedQuery,
        response: { 200: GrowthContentFeedResponse },
      },
      config: { public: true },
    },
    async (req, reply) => {
      assertGrowthAuthorized(req.headers.authorization);

      const from = new Date(req.query.from);
      const to = new Date(req.query.to);
      const createdInWindow = { createdAt: { gte: from, lt: to } };

      const [totals, cities, topMatchRows] = await Promise.all([
        computeTotals({ from, to }),
        computeCityGrowth({ from, to }),
        // topMatches: matches created in the window, each with its group
        // name (`Match.group` relation) and its logged `MatchStat`s (summed
        // below into a per-match goals count) — ranked and capped to the top
        // 5 in application code since Prisma can't order by an aggregate
        // over a to-many relation directly.
        prisma.match.findMany({
          where: createdInWindow,
          select: {
            id: true,
            city: true,
            group: { select: { name: true } },
            stats: { select: { goals: true } },
          },
        }),
      ]);

      const topMatches: GrowthContentFeedResponse["topMatches"] = topMatchRows
        .map((m) => ({
          id: m.id,
          city: m.city,
          goals: m.stats.reduce((sum, s) => sum + s.goals, 0),
          groupName: m.group.name,
        }))
        .sort((a, b) => b.goals - a.goals)
        .slice(0, 5);

      // milestones (group member-count crossing a round threshold in-window):
      // `Group` has no `city` field (only `Match` does, and a group's
      // matches can span several cities), so a milestone's `city` isn't
      // cheaply derivable from the schema as-is. Left unimplemented — the
      // growth-os connector tolerates `[]`.
      // TODO: derive milestones once groups carry a city (or a
      // milestone-worthy definition of "the group's city" is decided).
      const milestones: GrowthContentFeedResponse["milestones"] = [];

      const hotCity: GrowthContentFeedResponse["hotCity"] = cities[0] ?? null;

      void reply.code(200).send({
        range: { from: req.query.from, to: req.query.to },
        topMatches,
        milestones,
        hotCity,
        totals,
      });
    },
  );
};
