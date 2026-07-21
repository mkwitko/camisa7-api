import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createAttendanceRepository } from "@/http/api/matches/children/attendance/attendance.repository";
import { createMatchesRepository } from "@/http/api/matches/matches.repository";
import { requireUser } from "@/http/hooks/auth";
import { prisma } from "@/infra/db/client";
import { ReputationParams, ReputationResponse } from "../reputation.schema";
import { createReputationRepository } from "../reputation.repository";
import { createGetReputationService } from "./get-reputation.service";

export const getReputationRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().get(
    "/matches/:id/reputation",
    {
      schema: {
        operationId: "getReputation",
        tags: ["reputation"],
        params: ReputationParams,
        response: { 200: ReputationResponse },
      },
    },
    async (req, reply) => {
      const service = createGetReputationService({
        matchesRepo: createMatchesRepository(prisma),
        attendanceRepo: createAttendanceRepository(prisma),
        reputationRepo: createReputationRepository(prisma),
      });
      const { userId } = requireUser(req);
      const tags = await service({ matchId: req.params.id, userId });
      void reply.code(200).send({ tags });
    },
  );
};
