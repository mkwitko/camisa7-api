import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createPlayersRepository } from "@/http/api/players/players.repository";
import { requireUser } from "@/http/hooks/auth";
import { prisma } from "@/infra/db/client";
import { presentAttendance } from "../attendance.presenter";
import { createAttendanceRepository } from "../attendance.repository";
import { AttendanceResponse } from "../attendance.schema";
import { ConfirmPresenceParams } from "./confirm-presence.schema";
import { createConfirmPresenceService } from "./confirm-presence.service";

export const confirmPresenceRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().post(
    "/matches/:id/attendance",
    {
      schema: {
        operationId: "confirmPresence",
        tags: ["attendance"],
        params: ConfirmPresenceParams,
        response: { 201: AttendanceResponse },
      },
    },
    async (req, reply) => {
      const service = createConfirmPresenceService({
        attendanceRepo: createAttendanceRepository(prisma),
        playersRepo: createPlayersRepository(prisma),
      });
      const { userId } = requireUser(req);
      const attendance = await service({ matchId: req.params.id, userId });
      void reply.code(201).send(presentAttendance(attendance));
    },
  );
};
