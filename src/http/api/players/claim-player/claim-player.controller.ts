import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createPlayerCareerRepository } from "@/http/api/players/children/career/career.repository";
import { createPlayersRepository } from "@/http/api/players/players.repository";
import { requireUser } from "@/http/hooks/auth";
import { prisma } from "@/infra/db/client";
import { presentClaimResult } from "./claim-player.presenter";
import { createClaimPlayerRepository } from "./claim-player.repository";
import { ClaimPlayerBody, ClaimPlayerResponse } from "./claim-player.schema";
import { createClaimPlayerService } from "./claim-player.service";

/**
 * `POST /players/claim` — F1-5 guest→account merge. See
 * `claim-player.service.ts`'s doc comment for the full behavior + the
 * phone-only-claim security caveat that must ship alongside this endpoint.
 */
export const claimPlayerRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().post(
    "/players/claim",
    {
      schema: {
        operationId: "claimPlayer",
        tags: ["players"],
        body: ClaimPlayerBody,
        response: { 200: ClaimPlayerResponse },
      },
    },
    async (req, reply) => {
      const service = createClaimPlayerService({
        playersRepo: createPlayersRepository(prisma),
        claimRepo: createClaimPlayerRepository(prisma),
        careerRepo: createPlayerCareerRepository(prisma),
      });
      const { userId } = requireUser(req);
      const result = await service(userId, req.body.phone);
      void reply.code(200).send(presentClaimResult(result));
    },
  );
};
