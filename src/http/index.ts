import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod/v4";
import { authRoutes } from "@/http/api/auth/index";
import { billingRoutes } from "@/http/api/billing/index";
import { bookingsRoutes } from "@/http/api/bookings/index";
import { connectRoutes } from "@/http/api/connect/index";
import { courtsRoutes } from "@/http/api/courts/index";
import { discoverRoutes } from "@/http/api/discover/discover.controller";
import { duesRoutes } from "@/http/api/dues/index";
import { groupsRoutes } from "@/http/api/groups/index";
import { growthRoutes } from "@/http/api/growth/growth.controller";
import { invitesRoutes } from "@/http/api/invites/index";
import { matchesRoutes } from "@/http/api/matches/index";
import { paymentsRoutes } from "@/http/api/payments/index";
import { playersRoutes } from "@/http/api/players/index";
import { rankingsRoutes } from "@/http/api/rankings/global.controller";
import { seriesRoutes } from "@/http/api/series/index";
import { shareRoutes } from "@/http/api/share/share.controller";
import { wellKnownRoutes } from "@/http/api/share/well-known.controller";
import { venuesRoutes } from "@/http/api/venues/index";
import { authHook } from "@/http/hooks/auth";

const HealthResponse = z.object({ status: z.literal("ok") });

/**
 * Registra as rotas HTTP do app. `authHook` (Task 2) roda como `preHandler`
 * global: toda rota é autenticada por padrão, opt-out via `config: { public:
 * true }` (ex. `/health`, `POST /auth/register`, `POST /auth/login`). Sem
 * `permissionsHook` neste projeto (own JWT, sem personas Cognito) — ver
 * ARCHITECTURE.md §7.1 das convenções do backend e `src/http/hooks/auth.ts`.
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
  await app.register(playersRoutes);
  await app.register(seriesRoutes);
  await app.register(duesRoutes);
  await app.register(rankingsRoutes);
  await app.register(billingRoutes);
  await app.register(discoverRoutes);
  await app.register(venuesRoutes);
  await app.register(connectRoutes);
  await app.register(courtsRoutes);
  await app.register(bookingsRoutes);
  await app.register(paymentsRoutes);
  await app.register(growthRoutes);
  await app.register(shareRoutes);
  await app.register(wellKnownRoutes);
};
