import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { requireUser } from "@/http/hooks/auth";
import { prisma } from "@/infra/db/client";
import { createGroupsRepository } from "../groups.repository";
import { ListMyGroupsResponse } from "./list-my-groups.schema";
import { createListMyGroupsService } from "./list-my-groups.service";

export const listMyGroupsRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().get(
    "/groups",
    {
      schema: {
        operationId: "listMyGroups",
        tags: ["groups"],
        response: { 200: ListMyGroupsResponse },
      },
    },
    async (req, reply) => {
      const service = createListMyGroupsService({ repo: createGroupsRepository(prisma) });
      const { userId } = requireUser(req);
      const groups = await service(userId);
      void reply.code(200).send(groups);
    },
  );
};
