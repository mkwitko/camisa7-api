import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createGroupsRepository } from "@/http/api/groups/groups.repository";
import { requireUser } from "@/http/hooks/auth";
import { prisma } from "@/infra/db/client";
import { presentSeries } from "../series.presenter";
import { createSeriesRepository } from "../series.repository";
import { SeriesResponse } from "../series.schema";
import { GetSeriesParams } from "./get-series.schema";
import { createGetSeriesService } from "./get-series.service";

export const getSeriesRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().get(
    "/series/:id",
    {
      schema: {
        operationId: "getSeries",
        tags: ["series"],
        params: GetSeriesParams,
        response: { 200: SeriesResponse },
      },
    },
    async (req, reply) => {
      const service = createGetSeriesService({
        seriesRepo: createSeriesRepository(prisma),
        groupsRepo: createGroupsRepository(prisma),
      });
      const { userId } = requireUser(req);
      const series = await service(req.params.id, userId);
      void reply.code(200).send(presentSeries(series));
    },
  );
};
