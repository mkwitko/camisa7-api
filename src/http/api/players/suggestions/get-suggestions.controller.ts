import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createAuthRepository } from "@/http/api/auth/auth.repository";
import { createPlayerCareerRepository } from "@/http/api/players/children/career/career.repository";
import { createPlayersRepository } from "@/http/api/players/players.repository";
import { requireUser } from "@/http/hooks/auth";
import { prisma } from "@/infra/db/client";
import { createGetSuggestionsService } from "./get-suggestions.service";
import { createSuggestionsRepository } from "./suggestions.repository";
import { SuggestionsQuery, SuggestionsResponse } from "./suggestions.schema";

/**
 * `GET /players/suggestions` — nearby, similar-level players for the caller
 * to invite/discover, ranked by `get-suggestions.service.ts`. Requires auth
 * (global hook); returns `{ suggestions: [] }` when the caller has no known
 * location (`User.lastLat`/`lastLng` unset — see the service's early return).
 */
export const getSuggestionsRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().get(
    "/players/suggestions",
    {
      schema: {
        operationId: "getPlayerSuggestions",
        tags: ["players"],
        querystring: SuggestionsQuery,
        response: { 200: SuggestionsResponse },
      },
    },
    async (req, reply) => {
      const service = createGetSuggestionsService({
        authRepo: createAuthRepository(prisma),
        playersRepo: createPlayersRepository(prisma),
        careerRepo: createPlayerCareerRepository(prisma),
        suggestionsRepo: createSuggestionsRepository(prisma),
      });
      const { userId } = requireUser(req);
      const suggestions = await service.run(userId, {
        radiusKm: req.query.radiusKm,
        limit: req.query.limit,
      });
      void reply.code(200).send({ suggestions });
    },
  );
};
