import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { prisma } from "@/infra/db/client";
import { createAuthRepository } from "../auth.repository";
import { AuthResponse } from "../auth.schema";
import { LoginBody } from "./login.schema";
import { createLoginService } from "./login.service";

export const loginRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().post(
    "/auth/login",
    {
      schema: {
        operationId: "loginUser",
        tags: ["auth"],
        body: LoginBody,
        response: { 200: AuthResponse },
      },
      config: { public: true },
    },
    async (req, reply) => {
      const service = createLoginService({
        repo: createAuthRepository(prisma),
        jwt: app.gateways.jwt,
      });
      const result = await service(req.body);
      void reply.code(200).send(result);
    },
  );
};
