import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { requireUser } from "@/http/hooks/auth";
import { prisma } from "@/infra/db/client";
import { createDiscoverRepository } from "./discover.repository";
import { DiscoverQuery, DiscoverResponse } from "./discover.schema";

/**
 * `GET /discover` — public matches near a point, nearest-first (Geo G3). Any
 * authenticated user (gated by the global `authHook`, no `config.public`).
 * Only matches in `isPublic` groups that are `open`, upcoming (`datetime >
 * now`) and geocoded surface here. The radius search runs in
 * `discover.repository` via `$queryRaw` over the earthdistance extension.
 */
export const discoverRoutes: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().get(
    "/discover",
    {
      schema: {
        operationId: "discover",
        tags: ["discover"],
        querystring: DiscoverQuery,
        response: { 200: DiscoverResponse },
      },
    },
    async (req, reply) => {
      requireUser(req);
      const repo = createDiscoverRepository(prisma);
      const matches = await repo.search({
        lat: req.query.lat,
        lng: req.query.lng,
        radiusKm: req.query.radiusKm,
        modality: req.query.modality,
        maxPriceCents: req.query.maxPriceCents,
        now: new Date(),
        limit: 100,
      });
      void reply.code(200).send(matches);
    },
  );
};
