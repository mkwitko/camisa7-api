import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod/v4";

const HealthResponse = z.object({ status: z.literal("ok") });

/**
 * Registra as rotas HTTP do app. `/health` é a única rota pública (Task 0) —
 * `config: { public: true }` documenta o contrato para quando a auth (Task
 * futura) ligar o `authHook` global que consulta essa flag.
 */
export const httpRoutes: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().get(
    "/health",
    {
      schema: {
        operationId: "getHealth",
        tags: ["health"],
        response: { 200: HealthResponse },
      },
      config: { public: true },
    },
    async () => ({ status: "ok" as const }),
  );
};
