import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createGroupsRepository } from "@/http/api/groups/groups.repository";
import { createAttendanceRepository } from "@/http/api/matches/children/attendance/attendance.repository";
import { createMatchResultRepository } from "@/http/api/matches/children/result/result.repository";
import { createPlayerCareerRepository } from "@/http/api/players/children/career/career.repository";
import { requireUser } from "@/http/hooks/auth";
import { prisma } from "@/infra/db/client";
import { presentMatch } from "../matches.presenter";
import { createMatchesRepository } from "../matches.repository";
import { MatchResponse } from "../matches.schema";
import { FinalizeMatchParams } from "./finalize-match.schema";
import { createFinalizeMatchService } from "./finalize-match.service";

export const finalizeMatchRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().post(
    "/matches/:id/finalize",
    {
      schema: {
        operationId: "finalizeMatch",
        tags: ["matches"],
        params: FinalizeMatchParams,
        response: { 200: MatchResponse },
      },
    },
    async (req, reply) => {
      const service = createFinalizeMatchService({
        matchesRepo: createMatchesRepository(prisma),
        groupsRepo: createGroupsRepository(prisma),
        resultRepo: createMatchResultRepository(prisma),
        attendanceRepo: createAttendanceRepository(prisma),
        careerRepo: createPlayerCareerRepository(prisma),
      });
      const { userId } = requireUser(req);
      const match = await service(req.params.id, userId);
      void reply.code(200).send(presentMatch(match));
    },
  );
};
