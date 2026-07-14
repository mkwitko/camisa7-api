import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { requireUser } from "@/http/hooks/auth";
import { prisma } from "@/infra/db/client";
import { createGroupsRepository } from "../../../groups.repository";
import { presentMember } from "../members.presenter";
import { createMembersRepository } from "../members.repository";
import { GroupMemberResponse } from "../members.schema";
import { UpdateMemberBody, UpdateMemberParams } from "./update-member.schema";
import { createUpdateMemberService } from "./update-member.service";

export const updateMemberRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().patch(
    "/groups/:id/members/:memberId",
    {
      schema: {
        operationId: "updateMember",
        tags: ["members"],
        params: UpdateMemberParams,
        body: UpdateMemberBody,
        response: { 200: GroupMemberResponse },
      },
    },
    async (req, reply) => {
      const service = createUpdateMemberService({
        groupsRepo: createGroupsRepository(prisma),
        membersRepo: createMembersRepository(prisma),
      });
      const { userId } = requireUser(req);
      const member = await service({
        groupId: req.params.id,
        memberId: req.params.memberId,
        userId,
        patch: req.body,
      });
      void reply.code(200).send(presentMember(member));
    },
  );
};
