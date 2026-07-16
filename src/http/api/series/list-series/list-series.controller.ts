import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createGroupsRepository } from "@/http/api/groups/groups.repository";
import { requireUser } from "@/http/hooks/auth";
import { prisma } from "@/infra/db/client";
import { presentSeries } from "../series.presenter";
import { createSeriesRepository } from "../series.repository";
import { ListGroupSeriesParams, ListGroupSeriesResponse } from "./list-series.schema";
import { createListGroupSeriesService } from "./list-series.service";

export const listGroupSeriesRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().get(
    "/groups/:id/series",
    {
      schema: {
        operationId: "listGroupSeries",
        tags: ["series"],
        params: ListGroupSeriesParams,
        response: { 200: ListGroupSeriesResponse },
      },
    },
    async (req, reply) => {
      const service = createListGroupSeriesService({
        seriesRepo: createSeriesRepository(prisma),
        groupsRepo: createGroupsRepository(prisma),
      });
      const { userId } = requireUser(req);
      const series = await service(req.params.id, userId);
      void reply.code(200).send(series.map(presentSeries));
    },
  );
};
