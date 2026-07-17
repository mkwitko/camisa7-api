import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createAuthRepository } from "@/http/api/auth/auth.repository";
import { getEntitlementsService } from "@/http/api/billing/entitlements.service";
import { requireUser } from "@/http/hooks/auth";
import { prisma } from "@/infra/db/client";
import { createGroupsRepository } from "../groups.repository";
import { GroupResponse } from "../groups.schema";
import { UpdateGroupBody, UpdateGroupParams } from "./update-group.schema";
import { createUpdateGroupService } from "./update-group.service";

export const updateGroupRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().patch(
    "/groups/:id",
    {
      schema: {
        operationId: "updateGroup",
        tags: ["groups"],
        params: UpdateGroupParams,
        body: UpdateGroupBody,
        response: { 200: GroupResponse },
      },
    },
    async (req, reply) => {
      const service = createUpdateGroupService({
        groupsRepo: createGroupsRepository(prisma),
        entitlements: getEntitlementsService(createAuthRepository(prisma)),
      });
      const { userId } = requireUser(req);
      const group = await service({
        groupId: req.params.id,
        userId,
        patch: req.body,
      });
      void reply.code(200).send(group);
    },
  );
};
