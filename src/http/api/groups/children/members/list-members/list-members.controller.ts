import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { requireUser } from "@/http/hooks/auth";
import { prisma } from "@/infra/db/client";
import { createGroupsRepository } from "../../../groups.repository";
import { presentMember } from "../members.presenter";
import { createMembersRepository } from "../members.repository";
import { GroupMemberResponse } from "../members.schema";
import { ListMembersParams } from "./list-members.schema";
import { createListMembersService } from "./list-members.service";

export const listMembersRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().get(
    "/groups/:id/members",
    {
      schema: {
        operationId: "listMembers",
        tags: ["members"],
        params: ListMembersParams,
        response: { 200: GroupMemberResponse.array() },
      },
    },
    async (req, reply) => {
      const service = createListMembersService({
        groupsRepo: createGroupsRepository(prisma),
        membersRepo: createMembersRepository(prisma),
      });
      const { userId } = requireUser(req);
      const members = await service(req.params.id, userId);
      void reply.code(200).send(members.map(presentMember));
    },
  );
};
