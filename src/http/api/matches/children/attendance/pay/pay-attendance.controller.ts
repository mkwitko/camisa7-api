import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createGroupsRepository } from "@/http/api/groups/groups.repository";
import { createPaymentsRepository } from "@/http/api/payments/payments.repository";
import { requireUser } from "@/http/hooks/auth";
import { prisma } from "@/infra/db/client";
import { createMatchesRepository } from "../../../matches.repository";
import { createAttendanceRepository } from "../attendance.repository";
import { PayAttendanceParams, PayAttendanceResponse } from "./pay-attendance.schema";
import { createPayAttendanceService } from "./pay-attendance.service";

/**
 * `POST /matches/:id/attendance/:attId/pay` — mints/reuses the Woovi PIX
 * charge for the caller's own attendance fee (see `pay-attendance.service.ts`).
 */
export const payAttendanceRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().post(
    "/matches/:id/attendance/:attId/pay",
    {
      schema: {
        operationId: "payAttendance",
        tags: ["attendance"],
        params: PayAttendanceParams,
        response: { 200: PayAttendanceResponse },
      },
    },
    async (req, reply) => {
      const service = createPayAttendanceService({
        matchesRepo: createMatchesRepository(prisma),
        groupsRepo: createGroupsRepository(prisma),
        attendanceRepo: createAttendanceRepository(prisma),
        paymentsRepo: createPaymentsRepository(prisma),
      });
      const { userId } = requireUser(req);
      const result = await service(req.params.id, req.params.attId, userId);
      void reply.code(200).send(result);
    },
  );
};
