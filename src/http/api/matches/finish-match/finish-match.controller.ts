import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createGroupsRepository } from "@/http/api/groups/groups.repository";
import { requireUser } from "@/http/hooks/auth";
import { prisma } from "@/infra/db/client";
import { presentMatch } from "../matches.presenter";
import { createMatchesRepository } from "../matches.repository";
import { MatchResponse } from "../matches.schema";
import { FinishMatchParams } from "./finish-match.schema";
import { createFinishMatchService } from "./finish-match.service";

export const finishMatchRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().post(
    "/matches/:id/finish",
    {
      schema: {
        operationId: "finishMatch",
        tags: ["matches"],
        params: FinishMatchParams,
        response: { 200: MatchResponse },
      },
    },
    async (req, reply) => {
      const service = createFinishMatchService({
        matchesRepo: createMatchesRepository(prisma),
        groupsRepo: createGroupsRepository(prisma),
      });
      const { userId } = requireUser(req);
      const match = await service(req.params.id, userId);
      void reply.code(200).send(presentMatch(match));
    },
  );
};
