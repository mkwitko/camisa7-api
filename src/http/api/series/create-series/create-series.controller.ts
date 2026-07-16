import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createGroupsRepository } from "@/http/api/groups/groups.repository";
import { requireUser } from "@/http/hooks/auth";
import { prisma } from "@/infra/db/client";
import { presentSeries } from "../series.presenter";
import { createSeriesRepository } from "../series.repository";
import { SeriesResponse } from "../series.schema";
import { CreateSeriesBody, CreateSeriesParams } from "./create-series.schema";
import { createCreateSeriesService } from "./create-series.service";

export const createSeriesRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().post(
    "/groups/:id/series",
    {
      schema: {
        operationId: "createSeries",
        tags: ["series"],
        params: CreateSeriesParams,
        body: CreateSeriesBody,
        response: { 201: SeriesResponse },
      },
    },
    async (req, reply) => {
      const service = createCreateSeriesService({
        seriesRepo: createSeriesRepository(prisma),
        groupsRepo: createGroupsRepository(prisma),
      });
      const { userId } = requireUser(req);
      const series = await service({ ...req.body, groupId: req.params.id, userId });
      void reply.code(201).send(presentSeries(series));
    },
  );
};
