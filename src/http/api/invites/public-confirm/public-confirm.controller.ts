import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createAttendanceRepository } from "@/http/api/matches/children/attendance/attendance.repository";
import { createPlayersRepository } from "@/http/api/players/players.repository";
import { prisma } from "@/infra/db/client";
import { createInviteRepository } from "../invites.repository";
import { PublicConfirmBody, PublicConfirmResponse } from "./public-confirm.schema";
import { createPublicConfirmService } from "./public-confirm.service";

/**
 * Public (`config: { public: true }`, bypasses `authHook`) — the viral-loop
 * confirm: a guest with NO app, NO account submits `{ token, name, phone? }`
 * straight from the invite link.
 */
export const publicConfirmRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().post(
    "/invite/confirm",
    {
      schema: {
        operationId: "publicConfirm",
        tags: ["invites"],
        body: PublicConfirmBody,
        response: { 201: PublicConfirmResponse },
      },
      config: { public: true },
    },
    async (req, reply) => {
      const service = createPublicConfirmService({
        inviteRepo: createInviteRepository(prisma),
        playersRepo: createPlayersRepository(prisma),
        attendanceRepo: createAttendanceRepository(prisma),
      });
      const result = await service(req.body);
      void reply.code(201).send(result);
    },
  );
};
