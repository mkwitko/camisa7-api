import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createGroupsRepository } from "@/http/api/groups/groups.repository";
import { requireUser } from "@/http/hooks/auth";
import { prisma } from "@/infra/db/client";
import { presentMatch } from "../matches.presenter";
import { createMatchesRepository } from "../matches.repository";
import { MatchResponse } from "../matches.schema";
import { CancelMatchParams } from "./cancel-match.schema";
import { createCancelMatchService } from "./cancel-match.service";

export const cancelMatchRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().post(
    "/matches/:id/cancel",
    {
      schema: {
        operationId: "cancelMatch",
        tags: ["matches"],
        params: CancelMatchParams,
        response: { 200: MatchResponse },
      },
    },
    async (req, reply) => {
      const service = createCancelMatchService({
        matchesRepo: createMatchesRepository(prisma),
        groupsRepo: createGroupsRepository(prisma),
      });
      const { userId } = requireUser(req);
      const match = await service(req.params.id, userId);
      void reply.code(200).send(presentMatch(match));
    },
  );
};
