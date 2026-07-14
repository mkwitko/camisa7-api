import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createAttendanceRepository } from "@/http/api/matches/children/attendance/attendance.repository";
import { prisma } from "@/infra/db/client";
import { createInviteRepository } from "../invites.repository";
import { ResolveInviteParams, ResolveInviteResponse } from "./resolve-invite.schema";
import { createResolveInviteService } from "./resolve-invite.service";

/**
 * Public (`config: { public: true }`, bypasses `authHook` — see
 * `src/http/index.ts` §7.1 of the company skill's ARCHITECTURE.md) — a
 * guest with NO app, NO account opens this from a WhatsApp-shared link.
 */
export const resolveInviteRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().get(
    "/invite/:token",
    {
      schema: {
        operationId: "resolveInvite",
        tags: ["invites"],
        params: ResolveInviteParams,
        response: { 200: ResolveInviteResponse },
      },
      config: { public: true },
    },
    async (req, reply) => {
      const service = createResolveInviteService({
        inviteRepo: createInviteRepository(prisma),
        attendanceRepo: createAttendanceRepository(prisma),
      });
      const result = await service(req.params.token);
      void reply.code(200).send(result);
    },
  );
};
