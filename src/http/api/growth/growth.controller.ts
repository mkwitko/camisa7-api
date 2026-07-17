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
 * (half-open: `from` inclusive, `to` exclusive). `goals` and per-city
 * `growthPct` are TODOs — not cheaply derivable from the current schema
 * without a heavier join/prior-period query, and the consumer tolerates
 * `0`/`[]` (see task brief).
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

      const [matches, newGroups, newUsers] = await Promise.all([
        prisma.match.count({ where: createdInWindow }),
        prisma.group.count({ where: createdInWindow }),
        prisma.user.count({ where: createdInWindow }),
      ]);

      // TODO(growth): sum `MatchStat.goals` for matches in this window once
      // the growth-os consumer actually needs it — a single
      // `prisma.matchStat.aggregate` with a `match: { createdAt: ... }`
      // relation filter would do it, left out for now per task brief.
      const goals = 0;
      // TODO(growth): per-city growth needs a previous-period comparison
      // query (same window length, shifted back) grouped by `Match.city` —
      // left out for now per task brief.
      const cities: GrowthMetricsResponse["cities"] = [];

      void reply.code(200).send({ matches, goals, newGroups, newUsers, cities });
    },
  );
};
