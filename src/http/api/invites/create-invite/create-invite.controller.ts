import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createGroupsRepository } from "@/http/api/groups/groups.repository";
import { createMatchesRepository } from "@/http/api/matches/matches.repository";
import { requireUser } from "@/http/hooks/auth";
import { prisma } from "@/infra/db/client";
import { createInviteRepository } from "../invites.repository";
import { CreateInviteParams, CreateInviteResponse } from "./create-invite.schema";
import { createCreateInviteService } from "./create-invite.service";

/**
 * Authenticated, group-owner only (no `config.public` — inherits the global
 * `authHook`, see `src/http/index.ts`). The two guest-facing invite routes
 * (`GET /invite/:token`, `POST /invite/confirm`) are the public ones.
 */
export const createInviteRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().post(
    "/matches/:id/invite",
    {
      schema: {
        operationId: "createInvite",
        tags: ["invites"],
        params: CreateInviteParams,
        response: { 201: CreateInviteResponse },
      },
    },
    async (req, reply) => {
      const service = createCreateInviteService({
        matchesRepo: createMatchesRepository(prisma),
        groupsRepo: createGroupsRepository(prisma),
        inviteRepo: createInviteRepository(prisma),
      });
      const { userId } = requireUser(req);
      const { token } = await service(req.params.id, userId);
      void reply.code(201).send({ token, sharePath: `/invite/${token}` });
    },
  );
};
