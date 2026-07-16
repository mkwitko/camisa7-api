import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createDuesRepository } from "@/http/api/dues/dues.repository";
import { createMembersRepository } from "@/http/api/groups/children/members/members.repository";
import { createGroupsRepository } from "@/http/api/groups/groups.repository";
import { requireUser } from "@/http/hooks/auth";
import { prisma } from "@/infra/db/client";
import { createMatchesRepository } from "../../../matches.repository";
import { presentAttendanceListItem } from "../attendance.presenter";
import { createAttendanceRepository } from "../attendance.repository";
import { AttendanceListItemResponse } from "../attendance.schema";
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
        response: { 200: AttendanceListItemResponse.array() },
      },
    },
    async (req, reply) => {
      const service = createListAttendanceService({
        attendanceRepo: createAttendanceRepository(prisma),
        matchesRepo: createMatchesRepository(prisma),
        groupsRepo: createGroupsRepository(prisma),
        membersRepo: createMembersRepository(prisma),
        duesRepo: createDuesRepository(prisma),
      });
      const { userId } = requireUser(req);
      const attendances = await service(req.params.id, userId, new Date());
      void reply.code(200).send(attendances.map(presentAttendanceListItem));
    },
  );
};
