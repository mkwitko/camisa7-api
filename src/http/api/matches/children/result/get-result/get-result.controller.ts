import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createMembersRepository } from "@/http/api/groups/children/members/members.repository";
import { createGroupsRepository } from "@/http/api/groups/groups.repository";
import { createMatchesRepository } from "@/http/api/matches/matches.repository";
import { requireUser } from "@/http/hooks/auth";
import { prisma } from "@/infra/db/client";
import { presentMatchResult } from "../result.presenter";
import { createMatchResultRepository } from "../result.repository";
import { MatchResultResponse } from "../result.schema";
import { GetResultParams } from "./get-result.schema";
import { createGetResultService } from "./get-result.service";

export const getResultRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().get(
    "/matches/:id/result",
    {
      schema: {
        operationId: "getResult",
        tags: ["result"],
        params: GetResultParams,
        response: { 200: MatchResultResponse },
      },
    },
    async (req, reply) => {
      const service = createGetResultService({
        matchesRepo: createMatchesRepository(prisma),
        groupsRepo: createGroupsRepository(prisma),
        membersRepo: createMembersRepository(prisma),
        resultRepo: createMatchResultRepository(prisma),
      });
      const { userId } = requireUser(req);
      const result = await service(req.params.id, userId);
      void reply.code(200).send(presentMatchResult(result));
    },
  );
};
