import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createGroupsRepository } from "@/http/api/groups/groups.repository";
import { requireUser } from "@/http/hooks/auth";
import { prisma } from "@/infra/db/client";
import { presentDue } from "../dues.presenter";
import { createDuesRepository } from "../dues.repository";
import { DueResponse } from "../dues.schema";
import { ConfirmDueBody, ConfirmDueParams } from "./confirm-due.schema";
import { createConfirmDueService } from "./confirm-due.service";

export const confirmDueRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().post(
    "/dues/:id/confirm",
    {
      schema: {
        operationId: "confirmDue",
        tags: ["dues"],
        params: ConfirmDueParams,
        body: ConfirmDueBody,
        response: { 200: DueResponse },
      },
    },
    async (req, reply) => {
      const service = createConfirmDueService({
        duesRepo: createDuesRepository(prisma),
        groupsRepo: createGroupsRepository(prisma),
      });
      const { userId } = requireUser(req);
      const paid = req.body?.paid ?? true;
      const due = await service(req.params.id, userId, paid);
      void reply.code(200).send(presentDue(due));
    },
  );
};
