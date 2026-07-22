import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { requireUser } from "@/http/hooks/auth";
import { prisma } from "@/infra/db/client";
import { createGroupsRepository } from "../../groups.repository";
import {
  CreateSubaccountBody,
  CreateSubaccountParams,
  CreateSubaccountResponse,
} from "./create-subaccount.schema";
import { createCreateSubaccountService } from "./create-subaccount.service";

/**
 * `POST /groups/:id/woovi/subaccount` — onboarding do organizador na Woovi
 * (ver `create-subaccount.service.ts`).
 */
export const createSubaccountRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().post(
    "/groups/:id/woovi/subaccount",
    {
      schema: {
        operationId: "createGroupSubaccount",
        tags: ["groups"],
        params: CreateSubaccountParams,
        body: CreateSubaccountBody,
        response: { 200: CreateSubaccountResponse },
      },
    },
    async (req, reply) => {
      const service = createCreateSubaccountService({
        groupsRepo: createGroupsRepository(prisma),
      });
      const { userId } = requireUser(req);
      const result = await service({
        groupId: req.params.id,
        userId,
        pixKey: req.body.pixKey,
      });
      void reply.code(200).send(result);
    },
  );
};
