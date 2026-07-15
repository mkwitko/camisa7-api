import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createMembersRepository } from "@/http/api/groups/children/members/members.repository";
import { createGroupsRepository } from "@/http/api/groups/groups.repository";
import { createMatchesRepository } from "@/http/api/matches/matches.repository";
import { requireUser } from "@/http/hooks/auth";
import { prisma } from "@/infra/db/client";
import { presentCategoryTally } from "../votes.presenter";
import { createVotesRepository } from "../votes.repository";
import { VoteTallyResponse } from "../votes.schema";
import { ListVoteTallyParams } from "./list-vote-tally.schema";
import { createListVoteTallyService } from "./list-vote-tally.service";

export const listVoteTallyRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().get(
    "/matches/:id/votes/tally",
    {
      schema: {
        operationId: "getVoteTally",
        tags: ["votes"],
        params: ListVoteTallyParams,
        response: { 200: VoteTallyResponse },
      },
    },
    async (req, reply) => {
      const service = createListVoteTallyService({
        matchesRepo: createMatchesRepository(prisma),
        groupsRepo: createGroupsRepository(prisma),
        membersRepo: createMembersRepository(prisma),
        votesRepo: createVotesRepository(prisma),
      });
      const { userId } = requireUser(req);
      const tally = await service(req.params.id, userId);
      void reply.code(200).send(tally.map(presentCategoryTally));
    },
  );
};
