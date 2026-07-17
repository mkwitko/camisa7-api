import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createGroupsRepository } from "@/http/api/groups/groups.repository";
import { createPlayersRepository } from "@/http/api/players/players.repository";
import { requireUser } from "@/http/hooks/auth";
import { prisma } from "@/infra/db/client";
import { createMembersRepository } from "../members/members.repository";
import { GroupRankingResponse, RankingParams } from "./ranking.schema";
import { createRankingRepository } from "./ranking.repository";
import { createRankingService } from "./ranking.service";

/**
 * `GET /groups/:id/ranking` — ranking da pelada (artilheiro/assist/clean
 * sheets/MVP/presença/pontuação), agregado sobre as partidas fechadas do
 * grupo. Visível pro dono e pros membros (ver o service).
 */
export const groupRankingRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().get(
    "/groups/:id/ranking",
    {
      schema: {
        operationId: "getGroupRanking",
        tags: ["groups"],
        params: RankingParams,
        response: { 200: GroupRankingResponse },
      },
    },
    async (req, reply) => {
      const service = createRankingService({
        groupsRepo: createGroupsRepository(prisma),
        membersRepo: createMembersRepository(prisma),
        playersRepo: createPlayersRepository(prisma),
        rankingRepo: createRankingRepository(prisma),
      });
      const { userId } = requireUser(req);
      const ranking = await service(req.params.id, userId);
      void reply.code(200).send(ranking);
    },
  );
};
