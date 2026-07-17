import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { requireUser } from "@/http/hooks/auth";
import { prisma } from "@/infra/db/client";
import { createAuthRepository } from "../auth.repository";
import { UserResponse } from "../auth.schema";
import { MeLocationBody } from "./me-location.schema";
import { createUpdateMeLocationService } from "./me-location.service";

export const meLocationRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().put(
    "/me/location",
    {
      schema: {
        operationId: "updateMeLocation",
        tags: ["auth"],
        body: MeLocationBody,
        response: { 200: UserResponse },
      },
      // No `config.public` — same global `authHook` as `/auth/me`.
    },
    async (req, reply) => {
      const service = createUpdateMeLocationService({ repo: createAuthRepository(prisma) });
      const { userId } = requireUser(req);
      const user = await service(userId, req.body);
      void reply.code(200).send(user);
    },
  );
};
