import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod/v4";
import { prisma } from "@/infra/db/client";
import { createTimelineRepository } from "./timeline.repository";

const TimelineParams = z.object({ playerId: z.uuid() });

const TimelineEventSchema = z.object({
  matchId: z.uuid(),
  datetime: z.string(),
  type: z.enum(["hat_trick", "goals", "assists", "mvp", "clean_sheet"]),
  icon: z.string(),
  text: z.string(),
});
const TimelineResponse = z.object({ events: z.array(TimelineEventSchema) });

const TIMELINE_LIMIT = 30;

/**
 * `GET /players/:playerId/timeline` — feed de marcos do jogador (hat-trick,
 * gols, assistências, MVP, clean sheet) das partidas fechadas, mais recentes
 * primeiro. Autenticado (qualquer jogador vê o de qualquer outro, igual à
 * carreira). O app agrupa por Hoje/Ontem/Semana a partir do `datetime`.
 */
export const timelineRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().get(
    "/players/:playerId/timeline",
    {
      schema: {
        operationId: "getPlayerTimeline",
        tags: ["players"],
        params: TimelineParams,
        response: { 200: TimelineResponse },
      },
    },
    async (req, reply) => {
      const repo = createTimelineRepository(prisma);
      const events = await repo.build(req.params.playerId, TIMELINE_LIMIT);
      void reply.code(200).send({ events });
    },
  );
};
