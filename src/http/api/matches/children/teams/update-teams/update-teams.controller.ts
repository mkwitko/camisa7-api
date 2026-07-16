import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createMembersRepository } from "@/http/api/groups/children/members/members.repository";
import { createGroupsRepository } from "@/http/api/groups/groups.repository";
import { createMatchesRepository } from "@/http/api/matches/matches.repository";
import { createPlayerCareerRepository } from "@/http/api/players/children/career/career.repository";
import { requireUser } from "@/http/hooks/auth";
import { prisma } from "@/infra/db/client";
import { createAttendanceRepository } from "../../attendance/attendance.repository";
import { presentTeamAssignment } from "../teams.presenter";
import { createTeamsRepository } from "../teams.repository";
import { TeamAssignmentResponse } from "../teams.schema";
import { UpdateTeamsBody, UpdateTeamsParams } from "./update-teams.schema";
import { createUpdateTeamsService } from "./update-teams.service";

export const updateTeamsRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().put(
    "/matches/:id/teams",
    {
      schema: {
        operationId: "updateTeams",
        tags: ["teams"],
        params: UpdateTeamsParams,
        body: UpdateTeamsBody,
        response: { 200: TeamAssignmentResponse },
      },
    },
    async (req, reply) => {
      const service = createUpdateTeamsService({
        matchesRepo: createMatchesRepository(prisma),
        groupsRepo: createGroupsRepository(prisma),
        attendanceRepo: createAttendanceRepository(prisma),
        membersRepo: createMembersRepository(prisma),
        teamsRepo: createTeamsRepository(prisma),
        careerRepo: createPlayerCareerRepository(prisma),
      });
      const { userId } = requireUser(req);
      const assignment = await service({
        matchId: req.params.id,
        userId,
        teams: req.body.teams,
      });
      void reply.code(200).send(presentTeamAssignment(assignment));
    },
  );
};
