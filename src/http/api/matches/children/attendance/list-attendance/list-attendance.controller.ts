import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createMembersRepository } from "@/http/api/groups/children/members/members.repository";
import { createGroupsRepository } from "@/http/api/groups/groups.repository";
import { requireUser } from "@/http/hooks/auth";
import { prisma } from "@/infra/db/client";
import { createMatchesRepository } from "../../../matches.repository";
import { presentAttendance } from "../attendance.presenter";
import { createAttendanceRepository } from "../attendance.repository";
import { AttendanceResponse } from "../attendance.schema";
import { ListAttendanceParams } from "./list-attendance.schema";
import { createListAttendanceService } from "./list-attendance.service";

export const listAttendanceRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().get(
    "/matches/:id/attendance",
    {
      schema: {
        operationId: "listAttendance",
        tags: ["attendance"],
        params: ListAttendanceParams,
        response: { 200: AttendanceResponse.array() },
      },
    },
    async (req, reply) => {
      const service = createListAttendanceService({
        attendanceRepo: createAttendanceRepository(prisma),
        matchesRepo: createMatchesRepository(prisma),
        groupsRepo: createGroupsRepository(prisma),
        membersRepo: createMembersRepository(prisma),
      });
      const { userId } = requireUser(req);
      const attendances = await service(req.params.id, userId);
      void reply.code(200).send(attendances.map(presentAttendance));
    },
  );
};
