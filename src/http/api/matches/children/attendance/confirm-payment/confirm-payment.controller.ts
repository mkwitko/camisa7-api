import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createGroupsRepository } from "@/http/api/groups/groups.repository";
import { requireUser } from "@/http/hooks/auth";
import { prisma } from "@/infra/db/client";
import { createMatchesRepository } from "../../../matches.repository";
import { presentAttendance } from "../attendance.presenter";
import { createAttendanceRepository } from "../attendance.repository";
import { AttendanceResponse } from "../attendance.schema";
import { ConfirmPaymentBody, ConfirmPaymentParams } from "./confirm-payment.schema";
import { createConfirmPaymentService } from "./confirm-payment.service";

export const confirmPaymentRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().post(
    "/matches/:id/attendance/:attId/confirm-payment",
    {
      schema: {
        operationId: "confirmPayment",
        tags: ["attendance"],
        params: ConfirmPaymentParams,
        body: ConfirmPaymentBody,
        response: { 200: AttendanceResponse },
      },
    },
    async (req, reply) => {
      const service = createConfirmPaymentService({
        attendanceRepo: createAttendanceRepository(prisma),
        matchesRepo: createMatchesRepository(prisma),
        groupsRepo: createGroupsRepository(prisma),
      });
      const { userId } = requireUser(req);
      const paid = req.body?.paid ?? true;
      const attendance = await service(req.params.id, req.params.attId, userId, paid);
      void reply.code(200).send(presentAttendance(attendance));
    },
  );
};
