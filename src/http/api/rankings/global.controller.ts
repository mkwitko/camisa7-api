import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { aggregateRanking } from "@/http/api/groups/children/ranking/ranking.repository";
import { GroupRankingResponse } from "@/http/api/groups/children/ranking/ranking.schema";
import { prisma } from "@/infra/db/client";

const GLOBAL_LIMIT = 20;

/**
 * `GET /rankings/global` — ranking all-time sobre TODAS as partidas fechadas
 * (todos os grupos): artilharia, assistências, clean sheets, MVP, presença,
 * pontuação. Top 20. Autenticado (hook global). Ranking por cidade/região virá
 * com a fundação de geolocalização (coords + reverse-geocode).
 */
export const globalRankingRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().get(
    "/rankings/global",
    {
      schema: {
        operationId: "getGlobalRanking",
        tags: ["rankings"],
        response: { 200: GroupRankingResponse },
      },
    },
    async (_req, reply) => {
      const matches = await prisma.match.findMany({
        where: { status: { in: ["closed", "finished"] } },
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
