import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createReputationRepository } from "@/http/api/matches/children/reputation/reputation.repository";
import { createPlayersRepository } from "@/http/api/players/players.repository";
import { requireUser } from "@/http/hooks/auth";
import { prisma } from "@/infra/db/client";
import { createGroupsRepository } from "../../groups.repository";
import { createMembersRepository } from "../members/members.repository";
import { GroupReputationParams, GroupReputationResponse } from "./reputation.schema";
import { createGroupReputationService } from "./reputation.service";

/**
 * `GET /groups/:id/reputation` — contagem de tags de reputação (por
 * dimensão) recebida por cada membro do grupo (visão do organizador).
 * Visível pro dono e pros membros do grupo — mesmo gate do
 * `GET /groups/:id/ranking` (ver `reputation.service.ts`).
 */
export const groupReputationRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().get(
    "/groups/:id/reputation",
    {
      schema: {
        operationId: "getGroupReputation",
        tags: ["groups"],
        params: GroupReputationParams,
        response: { 200: GroupReputationResponse },
      },
    },
    async (req, reply) => {
      const service = createGroupReputationService({
        groupsRepo: createGroupsRepository(prisma),
        membersRepo: createMembersRepository(prisma),
        playersRepo: createPlayersRepository(prisma),
        reputationRepo: createReputationRepository(prisma),
      });
      const { userId } = requireUser(req);
      const members = await service(req.params.id, userId);
      void reply.code(200).send({ members });
    },
  );
};
