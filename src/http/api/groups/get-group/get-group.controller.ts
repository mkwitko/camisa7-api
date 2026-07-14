import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { requireUser } from "@/http/hooks/auth";
import { prisma } from "@/infra/db/client";
import { createGroupsRepository } from "../groups.repository";
import { GroupResponse } from "../groups.schema";
import { GetGroupParams } from "./get-group.schema";
import { createGetGroupService } from "./get-group.service";

export const getGroupRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().get(
    "/groups/:id",
    {
      schema: {
        operationId: "getGroup",
        tags: ["groups"],
        params: GetGroupParams,
        response: { 200: GroupResponse },
      },
    },
    async (req, reply) => {
      const service = createGetGroupService({ repo: createGroupsRepository(prisma) });
      const { userId } = requireUser(req);
      const group = await service(req.params.id, userId);
      void reply.code(200).send(group);
    },
  );
};
