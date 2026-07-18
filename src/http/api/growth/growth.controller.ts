import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { env } from "@/config/env";
import { prisma } from "@/infra/db/client";
import { ERRORS } from "@/shared/errors/catalog";
import { GrowthMetricsQuery, GrowthMetricsResponse } from "./growth.schema";

const BEARER_PREFIX = "Bearer ";

/**
 * `GET /api/growth/metrics` — server-to-server endpoint consumed by the
 * growth-os reporting pipeline. NOT gated by the regular JWT `authHook`
 * (`config: { public: true }` opts it out, per `src/http/hooks/auth.ts`) —
 * instead it's gated by its own shared-secret bearer token
 * (`GROWTH_SERVICE_TOKEN`), checked here. `GROWTH_SERVICE_TOKEN` unset on
 * this deploy -> 503 (`GRW.DISABLED`, same config-gated-feature convention as
 * `BIL.DISABLED`/`CON.DISABLED`); missing/mismatched
 * `Authorization: Bearer <token>` -> 401 (`GRW.UNAUTHORIZED`).
 *
 * Counts `Match`/`Group`/`User` rows created in the `[from, to)` window
 * (half-open: `from` inclusive, `to` exclusive). `goals` sums the per-player
 * `MatchStat.goals` logged against matches created in that window. `cities`
 * ranks the top 5 cities by new-user growth (current window vs. the
 * immediately-preceding equal-length window), keyed off `User.lastCity`.
 */
export const growthRoutes: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().get(
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
      const token = env.GROWTH_SERVICE_TOKEN;
      if (!token) throw ERRORS.GRW.DISABLED();

      const header = req.headers.authorization;
      if (header !== `${BEARER_PREFIX}${token}`) throw ERRORS.GRW.UNAUTHORIZED();

      const from = new Date(req.query.from);
      const to = new Date(req.query.to);
      const createdInWindow = { createdAt: { gte: from, lt: to } };

      // Previous equal-length window, immediately preceding `from` — the
      // baseline the per-city growth % below is computed against.
      const windowMs = to.getTime() - from.getTime();
      const prevFrom = new Date(from.getTime() - windowMs);
      const prevTo = from;

      const [matches, newGroups, newUsers, goalsAgg, currentCityCounts, prevCityCounts] =
        await Promise.all([
          prisma.match.count({ where: createdInWindow }),
          prisma.group.count({ where: createdInWindow }),
          prisma.user.count({ where: createdInWindow }),
          // goals = sum of logged per-player `MatchStat.goals` whose match was
          // created in this window (`MatchStat.match` is the relation field).
          prisma.matchStat.aggregate({
            _sum: { goals: true },
            where: { match: createdInWindow },
          }),
          prisma.user.groupBy({
            by: ["lastCity"],
            where: { ...createdInWindow, lastCity: { not: null } },
            _count: { _all: true },
          }),
          prisma.user.groupBy({
            by: ["lastCity"],
            where: {
              createdAt: { gte: prevFrom, lt: prevTo },
              lastCity: { not: null },
            },
            _count: { _all: true },
          }),
        ]);

      const goals = goalsAgg._sum.goals ?? 0;

      const prevCountByCity = new Map(
        prevCityCounts.map((row) => [row.lastCity as string, row._count._all]),
      );
      const cities: GrowthMetricsResponse["cities"] = currentCityCounts
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

      void reply.code(200).send({ matches, goals, newGroups, newUsers, cities });
    },
  );
};
