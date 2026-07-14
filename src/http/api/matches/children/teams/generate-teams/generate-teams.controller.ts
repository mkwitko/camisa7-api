import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createMembersRepository } from "@/http/api/groups/children/members/members.repository";
import { createGroupsRepository } from "@/http/api/groups/groups.repository";
import { createMatchesRepository } from "@/http/api/matches/matches.repository";
import { requireUser } from "@/http/hooks/auth";
import { prisma } from "@/infra/db/client";
import { createAttendanceRepository } from "../../attendance/attendance.repository";
import { presentTeamAssignment } from "../teams.presenter";
import { createTeamsRepository } from "../teams.repository";
import { TeamAssignmentResponse } from "../teams.schema";
import { GenerateTeamsParams, GenerateTeamsQuery } from "./generate-teams.schema";
import { createGenerateTeamsService } from "./generate-teams.service";

export const generateTeamsRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().post(
    "/matches/:id/teams",
    {
      schema: {
        operationId: "generateTeams",
        tags: ["teams"],
        params: GenerateTeamsParams,
        querystring: GenerateTeamsQuery,
        response: { 200: TeamAssignmentResponse },
      },
    },
    async (req, reply) => {
      const service = createGenerateTeamsService({
        matchesRepo: createMatchesRepository(prisma),
        groupsRepo: createGroupsRepository(prisma),
        attendanceRepo: createAttendanceRepository(prisma),
        membersRepo: createMembersRepository(prisma),
        teamsRepo: createTeamsRepository(prisma),
      });
      const { userId } = requireUser(req);
      const assignment = await service({
        matchId: req.params.id,
        userId,
        teamCount: req.query.teamCount,
      });
      void reply.code(200).send(presentTeamAssignment(assignment));
    },
  );
};
