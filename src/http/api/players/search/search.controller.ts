import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod/v4";
import { createPlayersRepository } from "@/http/api/players/players.repository";
import { prisma } from "@/infra/db/client";

const SearchQuery = z.object({
  q: z.string().trim().min(2).max(40),
});

const SearchResult = z.object({
  playerId: z.uuid(),
  name: z.string(),
  avatarUrl: z.string().nullable(),
});

const SearchResponse = z.object({ players: z.array(SearchResult) });

const SEARCH_LIMIT = 20;

/**
 * `GET /players/search?q=` — busca jogadores registrados por nome (min 2
 * chars), pra abrir o perfil público (`GET /players/:playerId/public-profile`).
 * Só nome + avatar (o card completo vem no perfil). Requer auth (global hook).
 */
export const searchPlayersRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().get(
    "/players/search",
    {
      schema: {
        operationId: "searchPlayers",
        tags: ["players"],
        querystring: SearchQuery,
        response: { 200: SearchResponse },
      },
    },
    async (req, reply) => {
      const repo = createPlayersRepository(prisma);
      const players = await repo.searchByName(req.query.q, SEARCH_LIMIT);
      void reply.code(200).send({
        players: players.map((p) => ({ playerId: p.id, name: p.name, avatarUrl: p.avatarUrl })),
      });
    },
  );
};
