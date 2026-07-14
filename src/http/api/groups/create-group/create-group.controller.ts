import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { requireUser } from "@/http/hooks/auth";
import { prisma } from "@/infra/db/client";
import { createGroupsRepository } from "../groups.repository";
import { GroupResponse } from "../groups.schema";
import { CreateGroupBody } from "./create-group.schema";
import { createCreateGroupService } from "./create-group.service";

export const createGroupRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().post(
    "/groups",
    {
      schema: {
        operationId: "createGroup",
        tags: ["groups"],
        body: CreateGroupBody,
        response: { 201: GroupResponse },
      },
    },
    async (req, reply) => {
      const service = createCreateGroupService({ repo: createGroupsRepository(prisma) });
      const { userId } = requireUser(req);
      const group = await service({ ...req.body, ownerId: userId });
      void reply.code(201).send(group);
    },
  );
};
