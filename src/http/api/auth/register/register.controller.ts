import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { prisma } from "@/infra/db/client";
import { createAuthRepository } from "../auth.repository";
import { AuthResponse } from "../auth.schema";
import { RegisterBody } from "./register.schema";
import { createRegisterService } from "./register.service";

export const registerRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().post(
    "/auth/register",
    {
      schema: {
        operationId: "registerUser",
        tags: ["auth"],
        body: RegisterBody,
        response: { 201: AuthResponse },
      },
      config: { public: true },
    },
    async (req, reply) => {
      const service = createRegisterService({
        repo: createAuthRepository(prisma),
        jwt: app.gateways.jwt,
      });
      const result = await service(req.body);
      void reply.code(201).send(result);
    },
  );
};
