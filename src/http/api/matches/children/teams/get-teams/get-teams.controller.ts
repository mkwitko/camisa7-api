import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createMembersRepository } from "@/http/api/groups/children/members/members.repository";
import { createGroupsRepository } from "@/http/api/groups/groups.repository";
import { createMatchesRepository } from "@/http/api/matches/matches.repository";
import { requireUser } from "@/http/hooks/auth";
import { prisma } from "@/infra/db/client";
import { presentTeamAssignment } from "../teams.presenter";
import { createTeamsRepository } from "../teams.repository";
import { TeamAssignmentResponse } from "../teams.schema";
import { GetTeamsParams } from "./get-teams.schema";
import { createGetTeamsService } from "./get-teams.service";

export const getTeamsRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().get(
    "/matches/:id/teams",
    {
      schema: {
        operationId: "getTeams",
        tags: ["teams"],
        params: GetTeamsParams,
        response: { 200: TeamAssignmentResponse },
      },
    },
    async (req, reply) => {
      const service = createGetTeamsService({
        matchesRepo: createMatchesRepository(prisma),
        groupsRepo: createGroupsRepository(prisma),
        membersRepo: createMembersRepository(prisma),
        teamsRepo: createTeamsRepository(prisma),
      });
      const { userId } = requireUser(req);
      const assignment = await service(req.params.id, userId);
      void reply.code(200).send(presentTeamAssignment(assignment));
    },
  );
};
