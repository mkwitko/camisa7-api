import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createAuthRepository } from "@/http/api/auth/auth.repository";
import { requireUser } from "@/http/hooks/auth";
import { prisma } from "@/infra/db/client";
import { ConnectAccountLinkResponse } from "../connect.schema";
import { createCreateConnectAccountService } from "./create-connect-account.service";

export const createConnectAccountRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().post(
    "/connect/account",
    {
      schema: {
        operationId: "createConnectAccount",
        tags: ["connect"],
        response: { 200: ConnectAccountLinkResponse },
      },
    },
    async (req, reply) => {
      const service = createCreateConnectAccountService({
        authRepo: createAuthRepository(prisma),
      });
      const { userId } = requireUser(req);
      const result = await service(userId);
      void reply.code(200).send(result);
    },
  );
};
