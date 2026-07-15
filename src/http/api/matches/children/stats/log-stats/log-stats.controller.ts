import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createGroupsRepository } from "@/http/api/groups/groups.repository";
import { createAttendanceRepository } from "@/http/api/matches/children/attendance/attendance.repository";
import { createMatchesRepository } from "@/http/api/matches/matches.repository";
import { requireUser } from "@/http/hooks/auth";
import { prisma } from "@/infra/db/client";
import { presentMatchStat } from "../stats.presenter";
import { createMatchStatsRepository } from "../stats.repository";
import { MatchStatResponse } from "../stats.schema";
import { LogStatsBody, LogStatsParams } from "./log-stats.schema";
import { createLogStatsService } from "./log-stats.service";

export const logStatsRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().post(
    "/matches/:id/stats",
    {
      schema: {
        operationId: "logStats",
        tags: ["stats"],
        params: LogStatsParams,
        body: LogStatsBody,
        response: { 200: MatchStatResponse.array() },
      },
    },
    async (req, reply) => {
      const service = createLogStatsService({
        matchesRepo: createMatchesRepository(prisma),
        groupsRepo: createGroupsRepository(prisma),
        attendanceRepo: createAttendanceRepository(prisma),
        statsRepo: createMatchStatsRepository(prisma),
      });
      const { userId } = requireUser(req);
      const stats = await service({
        matchId: req.params.id,
        userId,
        stats: req.body.stats,
      });
      void reply.code(200).send(stats.map(presentMatchStat));
    },
  );
};
