import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createPlayersRepository } from "@/http/api/players/players.repository";
import { requireUser } from "@/http/hooks/auth";
import { prisma } from "@/infra/db/client";
import { presentMyPlayer } from "./me.presenter";
import { MyPlayerResponse, UpdateMyPlayerBody } from "./me.schema";
import { createMyPlayerService, createUpdateMyPlayerService } from "./me.service";

/**
 * `GET /players/me` (F1-7) — resolves the caller's canonical `Player`, so
 * the app can chain into `GET /players/:playerId/career` for the "my
 * career" screen. No `config.public` — same "global `authHook` gates it"
 * as `GET /auth/me`.
 */
export const myPlayerRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().get(
    "/players/me",
    {
      schema: {
        operationId: "getMyPlayer",
        tags: ["players"],
        response: { 200: MyPlayerResponse },
      },
    },
    async (req, reply) => {
      const service = createMyPlayerService({ playersRepo: createPlayersRepository(prisma) });
      const { userId } = requireUser(req);
      const player = await service(userId);
      void reply.code(200).send(presentMyPlayer(player));
    },
  );
};

/** `PATCH /players/me` — edit the caller's own self-declared affinity (FM rating). */
export const updateMyPlayerRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().patch(
    "/players/me",
    {
      schema: {
        operationId: "updateMyPlayer",
        tags: ["players"],
        body: UpdateMyPlayerBody,
        response: { 200: MyPlayerResponse },
      },
    },
    async (req, reply) => {
      const service = createUpdateMyPlayerService({ playersRepo: createPlayersRepository(prisma) });
      const { userId } = requireUser(req);
      const player = await service(userId, {
        avatarUrl: req.body.avatarUrl,
        affinity: req.body.affinity,
        attributes: req.body.attributes,
        skills: req.body.skills,
        dominantFoot: req.body.dominantFoot,
        weakFoot: req.body.weakFoot,
        skillMoves: req.body.skillMoves,
        heightCm: req.body.heightCm,
        weightKg: req.body.weightKg,
        birthYear: req.body.birthYear,
        preferredTeam: req.body.preferredTeam,
        nationality: req.body.nationality,
      });
      void reply.code(200).send(presentMyPlayer(player));
    },
  );
};
