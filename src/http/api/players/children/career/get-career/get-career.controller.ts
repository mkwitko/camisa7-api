import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createPlayersRepository } from "@/http/api/players/players.repository";
import { requireUser } from "@/http/hooks/auth";
import { prisma } from "@/infra/db/client";
import { presentPlayerCareer } from "../career.presenter";
import { createPlayerCareerRepository } from "../career.repository";
import { PlayerCareerResponse } from "../career.schema";
import { GetCareerParams } from "./get-career.schema";
import { createGetCareerService } from "./get-career.service";

export const getCareerRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().get(
    "/players/:playerId/career",
    {
      schema: {
        operationId: "getPlayerCareer",
        tags: ["players"],
        params: GetCareerParams,
        response: { 200: PlayerCareerResponse },
      },
    },
    async (req, reply) => {
      const service = createGetCareerService({
        playersRepo: createPlayersRepository(prisma),
        careerRepo: createPlayerCareerRepository(prisma),
      });
      requireUser(req);
      const career = await service(req.params.playerId);
      void reply.code(200).send(presentPlayerCareer(req.params.playerId, career));
    },
  );
};
