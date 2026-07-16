import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createGroupsRepository } from "@/http/api/groups/groups.repository";
import { requireUser } from "@/http/hooks/auth";
import { prisma } from "@/infra/db/client";
import { presentDue } from "../dues.presenter";
import { createDuesRepository } from "../dues.repository";
import { DueResponse } from "../dues.schema";
import { MarkPaidDueParams } from "./mark-paid-due.schema";
import { createMarkPaidDueService } from "./mark-paid-due.service";

export const markPaidDueRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().post(
    "/dues/:id/mark-paid",
    {
      schema: {
        operationId: "markDuePaid",
        tags: ["dues"],
        params: MarkPaidDueParams,
        response: { 200: DueResponse },
      },
    },
    async (req, reply) => {
      const service = createMarkPaidDueService({
        duesRepo: createDuesRepository(prisma),
        groupsRepo: createGroupsRepository(prisma),
      });
      const { userId } = requireUser(req);
      const due = await service(req.params.id, userId);
      void reply.code(200).send(presentDue(due));
    },
  );
};
