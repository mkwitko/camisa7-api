import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createPlayersRepository } from "@/http/api/players/players.repository";
import { requireUser } from "@/http/hooks/auth";
import { prisma } from "@/infra/db/client";
import { createUpcomingMatchesRepository } from "./upcoming-matches.repository";
import { UpcomingMatchesResponse } from "./upcoming-matches.schema";
import { createUpcomingMatchesService } from "./upcoming-matches.service";

/**
 * `GET /players/me/upcoming-matches` — the caller's future matches across all
 * their groups, chronological, each with their attendance status. Feeds the
 * "Início" home screen. Gated by the global `authHook` (no `config.public`).
 */
export const upcomingMatchesRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().get(
    "/players/me/upcoming-matches",
    {
      schema: {
        operationId: "getMyUpcomingMatches",
        tags: ["players"],
        response: { 200: UpcomingMatchesResponse },
      },
    },
    async (req, reply) => {
      const service = createUpcomingMatchesService({
        playersRepo: createPlayersRepository(prisma),
        upcomingRepo: createUpcomingMatchesRepository(prisma),
      });
      const { userId } = requireUser(req);
      const matches = await service(userId, new Date());
      void reply.code(200).send(matches);
    },
  );
};
