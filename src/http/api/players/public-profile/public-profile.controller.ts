import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod/v4";
import { createPlayerCareerRepository } from "@/http/api/players/children/career/career.repository";
import { createPlayersRepository } from "@/http/api/players/players.repository";
import { prisma } from "@/infra/db/client";
import { ERRORS } from "@/shared/errors/catalog";
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
 *
 * `:playerId` accepts EITHER a uuid or a `Player.slug` (Task 1, share-carta
 * — pretty `/j/:slug` URLs). Resolved here, before the service, which only
 * ever deals in the real uuid: a uuid-shaped param is used as-is, anything
 * else is looked up by slug first (404 `PLR.NOT_FOUND` if neither resolves).
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
      const playersRepo = createPlayersRepository(prisma);
      const raw = req.params.playerId;
      const isUuid = z.uuid().safeParse(raw).success;
      const id = isUuid ? raw : (await playersRepo.findBySlug(raw))?.id;
      if (!id) throw ERRORS.PLR.NOT_FOUND();

      const service = createGetPublicProfileService({
        playersRepo,
        careerRepo: createPlayerCareerRepository(prisma),
      });
      const { player, career } = await service(id);
      void reply.code(200).send(presentPublicProfile(player, career));
    },
  );
};
