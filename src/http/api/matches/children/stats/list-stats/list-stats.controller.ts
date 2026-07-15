import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createMembersRepository } from "@/http/api/groups/children/members/members.repository";
import { createGroupsRepository } from "@/http/api/groups/groups.repository";
import { createMatchesRepository } from "@/http/api/matches/matches.repository";
import { requireUser } from "@/http/hooks/auth";
import { prisma } from "@/infra/db/client";
import { presentMatchStat } from "../stats.presenter";
import { createMatchStatsRepository } from "../stats.repository";
import { MatchStatResponse } from "../stats.schema";
import { ListStatsParams } from "./list-stats.schema";
import { createListStatsService } from "./list-stats.service";

export const listStatsRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().get(
    "/matches/:id/stats",
    {
      schema: {
        operationId: "listStats",
        tags: ["stats"],
        params: ListStatsParams,
        response: { 200: MatchStatResponse.array() },
      },
    },
    async (req, reply) => {
      const service = createListStatsService({
        matchesRepo: createMatchesRepository(prisma),
        groupsRepo: createGroupsRepository(prisma),
        membersRepo: createMembersRepository(prisma),
        statsRepo: createMatchStatsRepository(prisma),
      });
      const { userId } = requireUser(req);
      const stats = await service(req.params.id, userId);
      void reply.code(200).send(stats.map(presentMatchStat));
    },
  );
};
