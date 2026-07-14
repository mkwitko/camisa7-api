import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod/v4";
import { authRoutes } from "@/http/api/auth/index";
import { groupsRoutes } from "@/http/api/groups/index";
import { invitesRoutes } from "@/http/api/invites/index";
import { matchesRoutes } from "@/http/api/matches/index";
import { authHook } from "@/http/hooks/auth";

const HealthResponse = z.object({ status: z.literal("ok") });

/**
 * Registra as rotas HTTP do app. `authHook` (Task 2) roda como `preHandler`
 * global: toda rota é autenticada por padrão, opt-out via `config: { public:
 * true }` (ex. `/health`, `POST /auth/register`, `POST /auth/login`). Sem
 * `permissionsHook` neste projeto (own JWT, sem personas Cognito) — ver
 * ARCHITECTURE.md §7.1 do skill da empresa e `src/http/hooks/auth.ts`.
 */
export const httpRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", authHook);

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

  await app.register(authRoutes);
  await app.register(groupsRoutes);
  await app.register(matchesRoutes);
  await app.register(invitesRoutes);
};
