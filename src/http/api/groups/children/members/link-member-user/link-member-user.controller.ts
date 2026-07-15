import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createAuthRepository } from "@/http/api/auth/auth.repository";
import { createPlayerCareerRepository } from "@/http/api/players/children/career/career.repository";
import { createMergeGuestPlayerRepository } from "@/http/api/players/merge-guest-player.repository";
import { createPlayersRepository } from "@/http/api/players/players.repository";
import { requireUser } from "@/http/hooks/auth";
import { prisma } from "@/infra/db/client";
import { createGroupsRepository } from "../../../groups.repository";
import { createMembersRepository } from "../members.repository";
import { presentLinkMemberUserResult } from "./link-member-user.presenter";
import {
  LinkMemberUserBody,
  LinkMemberUserParams,
  LinkMemberUserResponse,
} from "./link-member-user.schema";
import { createLinkMemberUserService } from "./link-member-user.service";

/**
 * `POST /groups/:id/members/:memberId/link-user` — organizer-vouched
 * guest→account linking (replaces the removed phone-only
 * `POST /players/claim`; see `link-member-user.service.ts`'s doc comment).
 * Owner-only: `assertGroupOwner` inside the service 403s a non-owner.
 */
export const linkMemberUserRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().post(
    "/groups/:id/members/:memberId/link-user",
    {
      schema: {
        operationId: "linkMemberUser",
        tags: ["members"],
        params: LinkMemberUserParams,
        body: LinkMemberUserBody,
        response: { 200: LinkMemberUserResponse },
      },
    },
    async (req, reply) => {
      const service = createLinkMemberUserService({
        groupsRepo: createGroupsRepository(prisma),
        membersRepo: createMembersRepository(prisma),
        authRepo: createAuthRepository(prisma),
        playersRepo: createPlayersRepository(prisma),
        mergeRepo: createMergeGuestPlayerRepository(prisma),
        careerRepo: createPlayerCareerRepository(prisma),
      });
      const { userId } = requireUser(req);
      const result = await service({
        groupId: req.params.id,
        memberId: req.params.memberId,
        userId,
        email: req.body.email,
      });
      void reply.code(200).send(presentLinkMemberUserResult(result));
    },
  );
};
