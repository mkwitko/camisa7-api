import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createGroupsRepository } from "@/http/api/groups/groups.repository";
import { createMatchesRepository } from "@/http/api/matches/matches.repository";
import { requireUser } from "@/http/hooks/auth";
import { prisma } from "@/infra/db/client";
import { createTeamsRepository } from "../../teams/teams.repository";
import { presentMatchResult } from "../result.presenter";
import { createMatchResultRepository } from "../result.repository";
import { MatchResultResponse } from "../result.schema";
import { RecordResultBody, RecordResultParams } from "./record-result.schema";
import { createRecordResultService } from "./record-result.service";

export const recordResultRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().post(
    "/matches/:id/result",
    {
      schema: {
        operationId: "recordResult",
        tags: ["result"],
        params: RecordResultParams,
        body: RecordResultBody,
        response: { 200: MatchResultResponse },
      },
    },
    async (req, reply) => {
      const service = createRecordResultService({
        matchesRepo: createMatchesRepository(prisma),
        groupsRepo: createGroupsRepository(prisma),
        teamsRepo: createTeamsRepository(prisma),
        resultRepo: createMatchResultRepository(prisma),
      });
      const { userId } = requireUser(req);
      const result = await service({
        matchId: req.params.id,
        userId,
        scores: req.body.scores,
        winnerTeam: req.body.winnerTeam,
      });
      void reply.code(200).send(presentMatchResult(result));
    },
  );
};
