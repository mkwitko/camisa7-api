import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod/v4";
import { aggregateRanking } from "@/http/api/groups/children/ranking/ranking.repository";
import { GroupRankingResponse } from "@/http/api/groups/children/ranking/ranking.schema";
import { prisma } from "@/infra/db/client";

const GLOBAL_LIMIT = 20;

const GlobalRankingQuery = z.object({
  // Geo (G1): quando presente, agrega só partidas com `Match.city == city`
  // (case-insensitive). Ausente = global all-time (comportamento atual).
  city: z.string().min(1).optional(),
});

/**
 * `GET /rankings/global` — ranking all-time sobre TODAS as partidas fechadas
 * (todos os grupos): artilharia, assistências, clean sheets, MVP, presença,
 * pontuação. Top 20. Autenticado (hook global). `?city=` (Geo G1) filtra por
 * cidade da partida (case-insensitive).
 */
export const globalRankingRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().get(
    "/rankings/global",
    {
      schema: {
        operationId: "getGlobalRanking",
        tags: ["rankings"],
        querystring: GlobalRankingQuery,
        response: { 200: GroupRankingResponse },
      },
    },
    async (req, reply) => {
      const matches = await prisma.match.findMany({
        where: {
          status: { in: ["closed", "finished"] },
          ...(req.query.city ? { city: { equals: req.query.city, mode: "insensitive" } } : {}),
        },
        select: { id: true },
      });
      const ranking = await aggregateRanking(
        prisma,
        matches.map((m) => m.id),
        GLOBAL_LIMIT,
      );
      void reply.code(200).send(ranking);
    },
  );
};

export const rankingsRoutes: FastifyPluginAsync = async (app) => {
  await app.register(globalRankingRoute);
};
