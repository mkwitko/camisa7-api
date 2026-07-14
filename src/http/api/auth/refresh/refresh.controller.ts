import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { prisma } from "@/infra/db/client";
import { createAuthRepository } from "../auth.repository";
import { AuthResponse } from "../auth.schema";
import { RefreshBody } from "./refresh.schema";
import { createRefreshService } from "./refresh.service";

export const refreshRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().post(
    "/auth/refresh",
    {
      schema: {
        operationId: "refreshToken",
        tags: ["auth"],
        body: RefreshBody,
        response: { 200: AuthResponse },
      },
      config: { public: true },
    },
    async (req, reply) => {
      const service = createRefreshService({
        repo: createAuthRepository(prisma),
        jwt: app.gateways.jwt,
      });
      const result = await service(req.body);
      void reply.code(200).send(result);
    },
  );
};
