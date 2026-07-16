import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createGroupsRepository } from "@/http/api/groups/groups.repository";
import { presentMatch } from "@/http/api/matches/matches.presenter";
import { createMatchesRepository } from "@/http/api/matches/matches.repository";
import { requireUser } from "@/http/hooks/auth";
import { prisma } from "@/infra/db/client";
import { createSeriesRepository } from "../series.repository";
import {
  AddSeriesDatesBody,
  AddSeriesDatesParams,
  AddSeriesDatesResponse,
} from "./add-series-dates.schema";
import { createAddSeriesDatesService } from "./add-series-dates.service";

export const addSeriesDatesRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().post(
    "/series/:id/dates",
    {
      schema: {
        operationId: "addSeriesDates",
        tags: ["series"],
        params: AddSeriesDatesParams,
        body: AddSeriesDatesBody,
        response: { 201: AddSeriesDatesResponse },
      },
    },
    async (req, reply) => {
      const service = createAddSeriesDatesService({
        seriesRepo: createSeriesRepository(prisma),
        matchesRepo: createMatchesRepository(prisma),
        groupsRepo: createGroupsRepository(prisma),
      });
      const { userId } = requireUser(req);
      const { created } = await service(req.params.id, userId, req.body.dates);
      void reply.code(201).send(created.map(presentMatch));
    },
  );
};
