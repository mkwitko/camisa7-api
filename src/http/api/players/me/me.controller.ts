import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createPlayersRepository } from "@/http/api/players/players.repository";
import { requireUser } from "@/http/hooks/auth";
import { prisma } from "@/infra/db/client";
import { MyPlayerResponse } from "./me.schema";
import { createMyPlayerService } from "./me.service";

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
      void reply.code(200).send(player);
    },
  );
};
