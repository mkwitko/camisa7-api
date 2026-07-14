import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createGroupsRepository } from "@/http/api/groups/groups.repository";
import { requireUser } from "@/http/hooks/auth";
import { prisma } from "@/infra/db/client";
import { createMatchesRepository } from "../../../matches.repository";
import { presentCancelResult } from "../attendance.presenter";
import { createAttendanceRepository } from "../attendance.repository";
import { CancelPresenceResponse } from "../attendance.schema";
import { CancelPresenceParams } from "./cancel-presence.schema";
import { createCancelPresenceService } from "./cancel-presence.service";

export const cancelPresenceRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().post(
    "/matches/:id/attendance/:attId/cancel",
    {
      schema: {
        operationId: "cancelPresence",
        tags: ["attendance"],
        params: CancelPresenceParams,
        response: { 200: CancelPresenceResponse },
      },
    },
    async (req, reply) => {
      const service = createCancelPresenceService({
        attendanceRepo: createAttendanceRepository(prisma),
        matchesRepo: createMatchesRepository(prisma),
        groupsRepo: createGroupsRepository(prisma),
      });
      const { userId } = requireUser(req);
      const result = await service(req.params.id, req.params.attId, userId);
      void reply.code(200).send(presentCancelResult(result));
    },
  );
};
