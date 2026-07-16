import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createGroupsRepository } from "@/http/api/groups/groups.repository";
import { requireUser } from "@/http/hooks/auth";
import { prisma } from "@/infra/db/client";
import { presentSeries } from "../series.presenter";
import { createSeriesRepository } from "../series.repository";
import { SeriesResponse } from "../series.schema";
import { EndSeriesParams } from "./end-series.schema";
import { createEndSeriesService } from "./end-series.service";

/** `DELETE /series/:id` — mirrors `cancel-match`'s response convention (200 + the updated entity, not a bare 204) since the caller gets the freshly-`ended` series back in one round trip. */
export const endSeriesRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().delete(
    "/series/:id",
    {
      schema: {
        operationId: "endSeries",
        tags: ["series"],
        params: EndSeriesParams,
        response: { 200: SeriesResponse },
      },
    },
    async (req, reply) => {
      const service = createEndSeriesService({
        seriesRepo: createSeriesRepository(prisma),
        groupsRepo: createGroupsRepository(prisma),
      });
      const { userId } = requireUser(req);
      const series = await service(req.params.id, userId);
      void reply.code(200).send(presentSeries(series));
    },
  );
};
