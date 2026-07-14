import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createGroupsRepository } from "@/http/api/groups/groups.repository";
import { requireUser } from "@/http/hooks/auth";
import { prisma } from "@/infra/db/client";
import { presentMatch } from "../matches.presenter";
import { createMatchesRepository } from "../matches.repository";
import { ListMatchesParams, ListMatchesQuery, ListMatchesResponse } from "./list-matches.schema";
import { createListMatchesService } from "./list-matches.service";

export const listMatchesRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().get(
    "/groups/:id/matches",
    {
      schema: {
        operationId: "listMatches",
        tags: ["matches"],
        params: ListMatchesParams,
        querystring: ListMatchesQuery,
        response: { 200: ListMatchesResponse },
      },
    },
    async (req, reply) => {
      const service = createListMatchesService({
        matchesRepo: createMatchesRepository(prisma),
        groupsRepo: createGroupsRepository(prisma),
      });
      const { userId } = requireUser(req);
      const matches = await service(req.params.id, userId, {
        includeFinished: req.query.includeFinished,
      });
      void reply.code(200).send(matches.map(presentMatch));
    },
  );
};
