import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { requireUser } from "@/http/hooks/auth";
import { prisma } from "@/infra/db/client";
import { createAuthRepository } from "../auth.repository";
import { UserResponse } from "../auth.schema";
import { UpdateMeRolesBody } from "./me-roles.schema";
import { createUpdateMeRolesService } from "./me-roles.service";

export const meRolesRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().patch(
    "/auth/me/roles",
    {
      schema: {
        operationId: "updateMyRoles",
        tags: ["auth"],
        body: UpdateMeRolesBody,
        response: { 200: UserResponse },
      },
      // No `config.public` — same global `authHook` as `/auth/me`.
    },
    async (req, reply) => {
      const service = createUpdateMeRolesService({ repo: createAuthRepository(prisma) });
      const { userId } = requireUser(req);
      const user = await service(userId, req.body.roles);
      void reply.code(200).send(user);
    },
  );
};
