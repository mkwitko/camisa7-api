import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createAuthRepository } from "@/http/api/auth/auth.repository";
import { requireUser } from "@/http/hooks/auth";
import { prisma } from "@/infra/db/client";
import { ConnectStatusResponse } from "../connect.schema";
import { createGetConnectStatusService } from "./get-connect-status.service";

export const getConnectStatusRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().get(
    "/connect/status",
    {
      schema: {
        operationId: "getConnectStatus",
        tags: ["connect"],
        response: { 200: ConnectStatusResponse },
      },
    },
    async (req, reply) => {
      const service = createGetConnectStatusService({
        authRepo: createAuthRepository(prisma),
      });
      const { userId } = requireUser(req);
      const result = await service(userId);
      void reply.code(200).send(result);
    },
  );
};
