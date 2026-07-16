import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createGroupsRepository } from "@/http/api/groups/groups.repository";
import { createMatchesRepository } from "@/http/api/matches/matches.repository";
import { requireUser } from "@/http/hooks/auth";
import { prisma } from "@/infra/db/client";
import { presentSeries } from "../series.presenter";
import { createSeriesRepository } from "../series.repository";
import { SeriesResponse } from "../series.schema";
import { UpdateSeriesBody, UpdateSeriesParams } from "./update-series.schema";
import { createUpdateSeriesService } from "./update-series.service";

export const updateSeriesRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().patch(
    "/series/:id",
    {
      schema: {
        operationId: "updateSeries",
        tags: ["series"],
        params: UpdateSeriesParams,
        body: UpdateSeriesBody,
        response: { 200: SeriesResponse },
      },
    },
    async (req, reply) => {
      const service = createUpdateSeriesService({
        seriesRepo: createSeriesRepository(prisma),
        matchesRepo: createMatchesRepository(prisma),
        groupsRepo: createGroupsRepository(prisma),
        now: () => new Date(),
      });
      const { userId } = requireUser(req);
      const series = await service(req.params.id, userId, req.body);
      void reply.code(200).send(presentSeries(series));
    },
  );
};
