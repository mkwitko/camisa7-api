import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createGroupsRepository } from "@/http/api/groups/groups.repository";
import { requireUser } from "@/http/hooks/auth";
import { prisma } from "@/infra/db/client";
import { createMatchesRepository } from "../../../matches.repository";
import { presentAttendance } from "../attendance.presenter";
import { createAttendanceRepository } from "../attendance.repository";
import { AttendanceResponse } from "../attendance.schema";
import { MarkPaidParams } from "./mark-paid.schema";
import { createMarkPaidService } from "./mark-paid.service";

export const markPaidRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().post(
    "/matches/:id/attendance/:attId/mark-paid",
    {
      schema: {
        operationId: "markPaid",
        tags: ["attendance"],
        params: MarkPaidParams,
        response: { 200: AttendanceResponse },
      },
    },
    async (req, reply) => {
      const service = createMarkPaidService({
        attendanceRepo: createAttendanceRepository(prisma),
        matchesRepo: createMatchesRepository(prisma),
        groupsRepo: createGroupsRepository(prisma),
      });
      const { userId } = requireUser(req);
      const attendance = await service(req.params.id, req.params.attId, userId);
      void reply.code(200).send(presentAttendance(attendance));
    },
  );
};
