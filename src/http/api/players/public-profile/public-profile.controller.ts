import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createPlayerCareerRepository } from "@/http/api/players/children/career/career.repository";
import { createPlayersRepository } from "@/http/api/players/players.repository";
import { prisma } from "@/infra/db/client";
import { presentPublicProfile } from "./public-profile.presenter";
import { PublicProfileParams, PublicProfileResponse } from "./public-profile.schema";
import { createGetPublicProfileService } from "./public-profile.service";

/**
 * `GET /players/:playerId/public-profile` — F1-6, the shareable "Strava
 * card". Public (`config: { public: true }`, bypasses `authHook` — same
 * opt-out `resolve-invite`/`public-confirm`/`/health` use): the futebol-web
 * renders this from a shared link with NO login. See
 * `public-profile.service.ts`'s doc comment for the guest-vs-registered
 * 404 split and the enumeration/privacy tradeoff this route accepts.
 */
export const publicProfileRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().get(
    "/players/:playerId/public-profile",
    {
      schema: {
        operationId: "getPublicProfile",
        tags: ["players"],
        params: PublicProfileParams,
        response: { 200: PublicProfileResponse },
      },
      config: { public: true },
    },
    async (req, reply) => {
      const service = createGetPublicProfileService({
        playersRepo: createPlayersRepository(prisma),
        careerRepo: createPlayerCareerRepository(prisma),
      });
      const { player, career } = await service(req.params.playerId);
      void reply.code(200).send(presentPublicProfile(player, career));
    },
  );
};
