import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createMembersRepository } from "@/http/api/groups/children/members/members.repository";
import { createGroupsRepository } from "@/http/api/groups/groups.repository";
import { requireUser } from "@/http/hooks/auth";
import { prisma } from "@/infra/db/client";
import { competencyMonth } from "../competency";
import { presentDue } from "../dues.presenter";
import { createDuesRepository } from "../dues.repository";
import { DueResponse } from "../dues.schema";
import { ListGroupDuesParams, ListGroupDuesQuery } from "./list-dues.schema";
import { createListGroupDuesService } from "./list-dues.service";

export const listGroupDuesRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().get(
    "/groups/:groupId/dues",
    {
      schema: {
        operationId: "listGroupDues",
        tags: ["dues"],
        params: ListGroupDuesParams,
        querystring: ListGroupDuesQuery,
        response: { 200: DueResponse.array() },
      },
    },
    async (req, reply) => {
      const service = createListGroupDuesService({
        duesRepo: createDuesRepository(prisma),
        groupsRepo: createGroupsRepository(prisma),
        membersRepo: createMembersRepository(prisma),
      });
      const { userId } = requireUser(req);
      const month = req.query.month ?? competencyMonth(new Date());
      const dues = await service(req.params.groupId, userId, month);
      void reply.code(200).send(dues.map(presentDue));
    },
  );
};
