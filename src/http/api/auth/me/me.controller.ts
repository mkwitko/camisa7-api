import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { requireUser } from "@/http/hooks/auth";
import { prisma } from "@/infra/db/client";
import { createAuthRepository } from "../auth.repository";
import { UserResponse } from "../auth.schema";
import { createMeService } from "./me.service";

export const meRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().get(
    "/auth/me",
    {
      schema: {
        operationId: "getMe",
        tags: ["auth"],
        response: { 200: UserResponse },
      },
      // No `config.public` — proves the global `authHook` (§7.1): missing or
      // invalid bearer token -> 401 before this handler ever runs.
    },
    async (req, reply) => {
      const service = createMeService({ repo: createAuthRepository(prisma) });
      const { userId } = requireUser(req);
      const user = await service(userId);
      void reply.code(200).send(user);
    },
  );
};
