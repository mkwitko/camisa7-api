import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createGroupsRepository } from "@/http/api/groups/groups.repository";
import { requireUser } from "@/http/hooks/auth";
import { prisma } from "@/infra/db/client";
import { presentMatch } from "../matches.presenter";
import { createMatchesRepository } from "../matches.repository";
import { MatchResponse } from "../matches.schema";
import { UpdateMatchBody, UpdateMatchParams } from "./update-match.schema";
import { createUpdateMatchService } from "./update-match.service";

export const updateMatchRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().patch(
    "/matches/:id",
    {
      schema: {
        operationId: "updateMatch",
        tags: ["matches"],
        params: UpdateMatchParams,
        body: UpdateMatchBody,
        response: { 200: MatchResponse },
      },
    },
    async (req, reply) => {
      const service = createUpdateMatchService({
        matchesRepo: createMatchesRepository(prisma),
        groupsRepo: createGroupsRepository(prisma),
      });
      const { userId } = requireUser(req);
      const match = await service({ matchId: req.params.id, userId, patch: req.body });
      void reply.code(200).send(presentMatch(match));
    },
  );
};
