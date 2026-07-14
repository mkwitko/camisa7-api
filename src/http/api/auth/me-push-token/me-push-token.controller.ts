import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { requireUser } from "@/http/hooks/auth";
import { prisma } from "@/infra/db/client";
import { createAuthRepository } from "../auth.repository";
import { UpdatePushTokenBody, UpdatePushTokenResponse } from "./me-push-token.schema";
import { createUpdatePushTokenService } from "./me-push-token.service";

export const mePushTokenRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().patch(
    "/auth/me/push-token",
    {
      schema: {
        operationId: "updateMyPushToken",
        tags: ["auth"],
        body: UpdatePushTokenBody,
        response: { 200: UpdatePushTokenResponse },
      },
      // No `config.public` — same global `authHook` as `/auth/me`.
    },
    async (req, reply) => {
      const service = createUpdatePushTokenService({ repo: createAuthRepository(prisma) });
      const { userId } = requireUser(req);
      await service(userId, req.body.expoPushToken);
      void reply.code(200).send({ expoPushToken: req.body.expoPushToken });
    },
  );
};
