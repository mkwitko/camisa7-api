import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { requireUser } from "@/http/hooks/auth";
import { prisma } from "@/infra/db/client";
import { createGroupsRepository } from "../../../groups.repository";
import { presentMember } from "../members.presenter";
import { createMembersRepository } from "../members.repository";
import { GroupMemberResponse } from "../members.schema";
import { AddMemberBody, AddMemberParams } from "./add-member.schema";
import { createAddMemberService } from "./add-member.service";

export const addMemberRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().post(
    "/groups/:id/members",
    {
      schema: {
        operationId: "addMember",
        tags: ["members"],
        params: AddMemberParams,
        body: AddMemberBody,
        response: { 201: GroupMemberResponse },
      },
    },
    async (req, reply) => {
      const service = createAddMemberService({
        groupsRepo: createGroupsRepository(prisma),
        membersRepo: createMembersRepository(prisma),
      });
      const { userId } = requireUser(req);
      const member = await service({ ...req.body, groupId: req.params.id, userId });
      void reply.code(201).send(presentMember(member));
    },
  );
};
