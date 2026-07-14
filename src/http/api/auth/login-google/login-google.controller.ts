import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { prisma } from "@/infra/db/client";
import { createAuthRepository } from "../auth.repository";
import { AuthResponse } from "../auth.schema";
import { LoginGoogleBody } from "./login-google.schema";
import { createLoginGoogleService } from "./login-google.service";

export const loginGoogleRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().post(
    "/auth/login-google",
    {
      schema: {
        operationId: "loginGoogleUser",
        tags: ["auth"],
        body: LoginGoogleBody,
        response: { 200: AuthResponse },
      },
      config: { public: true },
    },
    async (req, reply) => {
      const service = createLoginGoogleService({
        repo: createAuthRepository(prisma),
        jwt: app.gateways.jwt,
        google: app.gateways.google,
      });
      const result = await service(req.body);
      void reply.code(200).send(result);
    },
  );
};
