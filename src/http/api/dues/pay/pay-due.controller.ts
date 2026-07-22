import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createGroupsRepository } from "@/http/api/groups/groups.repository";
import { createPaymentsRepository } from "@/http/api/payments/payments.repository";
import { requireUser } from "@/http/hooks/auth";
import { prisma } from "@/infra/db/client";
import { createDuesRepository } from "../dues.repository";
import { PayDueParams, PayDueResponse } from "./pay-due.schema";
import { createPayDueService } from "./pay-due.service";

/**
 * `POST /dues/:id/pay` — mints/reuses the Woovi PIX charge for the caller's
 * own membership due (see `pay-due.service.ts`).
 */
export const payDueRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().post(
    "/dues/:id/pay",
    {
      schema: {
        operationId: "payDue",
        tags: ["dues"],
        params: PayDueParams,
        response: { 200: PayDueResponse },
      },
    },
    async (req, reply) => {
      const service = createPayDueService({
        duesRepo: createDuesRepository(prisma),
        groupsRepo: createGroupsRepository(prisma),
        paymentsRepo: createPaymentsRepository(prisma),
      });
      const { userId } = requireUser(req);
      const result = await service(req.params.id, userId);
      void reply.code(200).send(result);
    },
  );
};
