import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createAttendanceRepository } from "@/http/api/matches/children/attendance/attendance.repository";
import { createMatchesRepository } from "@/http/api/matches/matches.repository";
import { requireUser } from "@/http/hooks/auth";
import { prisma } from "@/infra/db/client";
import { ReputationParams, ReputationResponse, SetReputationBody } from "../reputation.schema";
import { createReputationRepository } from "../reputation.repository";
import { createSetReputationService } from "./set-reputation.service";

export const setReputationRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().put(
    "/matches/:id/reputation",
    {
      schema: {
        operationId: "setReputation",
        tags: ["reputation"],
        params: ReputationParams,
        body: SetReputationBody,
        response: { 200: ReputationResponse },
      },
    },
    async (req, reply) => {
      const service = createSetReputationService({
        matchesRepo: createMatchesRepository(prisma),
        attendanceRepo: createAttendanceRepository(prisma),
        reputationRepo: createReputationRepository(prisma),
      });
      const { userId } = requireUser(req);
      const tags = await service({
        matchId: req.params.id,
        userId,
        tags: req.body.tags,
      });
      void reply.code(200).send({ tags });
    },
  );
};
