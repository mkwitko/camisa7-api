import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod/v4";
import { aggregateRanking } from "@/http/api/groups/children/ranking/ranking.repository";
import { createPlayerCareerRepository } from "@/http/api/players/children/career/career.repository";
import { createPlayersRepository } from "@/http/api/players/players.repository";
import { presentPublicProfile } from "@/http/api/players/public-profile/public-profile.presenter";
import { createGetPublicProfileService } from "@/http/api/players/public-profile/public-profile.service";
import { prisma } from "@/infra/db/client";
import { ERRORS } from "@/shared/errors/catalog";
import { renderCarta } from "./render/carta";
import { renderConquista } from "./render/conquista";
import { renderRanking } from "./render/ranking";
import { etagFor, pngCache } from "./share.cache";

/**
 * `/og/*` — server-rendered PNG share cards (Task 4, Fase 1 share-carta).
 * Consumed as an `<img src>`/OG-meta target by the futebol-web share pages,
 * so no auth (`config: { public: true }` on every route here, same opt-out
 * `public-profile`/`resolve-invite` use) and every response is `image/png`
 * with `Cache-Control` + a content-derived `ETag` for CDN/browser caching —
 * see `share.cache.ts`'s doc comments for the hashing/eviction scheme.
 *
 * A single process-wide `pngCache()` backs all three routes: satori+resvg
 * rendering (`render/*`) is CPU-bound, so a repeated request for the exact
 * same card (same ETag) is served from memory instead of re-rendered.
 */
const cache = pngCache();

/**
 * Resolves a `Player.slug` to its public profile card, reusing the exact
 * same lookup `public-profile.controller.ts` does. Throws `PLR.NOT_FOUND`
 * for an unknown slug and `PLR.NOT_PUBLIC` for a guest (`userId` null) —
 * both surface as 404 to an unauthenticated caller, same privacy posture
 * the public-profile route already commits to.
 */
async function loadProfileBySlug(slug: string) {
  const playersRepo = createPlayersRepository(prisma);
  const player = await playersRepo.findBySlug(slug);
  if (!player) throw ERRORS.PLR.NOT_FOUND();

  const service = createGetPublicProfileService({
    playersRepo,
    careerRepo: createPlayerCareerRepository(prisma),
  });
  const { player: p, career } = await service(player.id);
  return presentPublicProfile(p, career);
}

/** Sends a cached PNG with `ETag`/`Cache-Control`, or a bare 304 on a matching `If-None-Match`. */
function sendPng(reply: FastifyReply, req: FastifyRequest, etag: string, png: Buffer) {
  if (req.headers["if-none-match"] === etag) {
    void reply.code(304).send();
    return;
  }
  void reply
    .header("Content-Type", "image/png")
    .header("Cache-Control", "public, max-age=300, s-maxage=86400")
    .header("ETag", etag)
    .code(200)
    .send(png);
}

export const shareRoutes: FastifyPluginAsync = async (app) => {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    "/og/carta/:slug.png",
    {
      schema: {
        operationId: "ogCarta",
        tags: ["share"],
        params: z.object({ slug: z.string().min(1) }),
      },
      config: { public: true },
    },
    async (req, reply) => {
      const profile = await loadProfileBySlug(req.params.slug);
      const etag = etagFor(["carta", profile.playerId, profile.bestOverall, profile.matchesPlayed]);
      let png = cache.get(etag);
      if (!png) {
        png = await renderCarta(profile);
        cache.set(etag, png);
      }
      sendPng(reply, req, etag, png);
    },
  );

  typed.get(
    "/og/conquista/:slug/:key.png",
    {
      schema: {
        operationId: "ogConquista",
        tags: ["share"],
        params: z.object({ slug: z.string().min(1), key: z.string().min(1) }),
      },
      config: { public: true },
    },
    async (req, reply) => {
      const profile = await loadProfileBySlug(req.params.slug);
      const etag = etagFor(["conq", profile.playerId, req.params.key]);
      let png = cache.get(etag);
      if (!png) {
        png = await renderConquista(profile, req.params.key);
        cache.set(etag, png);
      }
      sendPng(reply, req, etag, png);
    },
  );

  typed.get(
    "/og/ranking/:groupId/:playerId.png",
    {
      schema: {
        operationId: "ogRanking",
        tags: ["share"],
        params: z.object({ groupId: z.uuid(), playerId: z.uuid() }),
      },
      config: { public: true },
    },
    async (req, reply) => {
      const { groupId, playerId } = req.params;
      const group = await prisma.group.findUnique({
        where: { id: groupId },
        select: { name: true },
      });
      if (!group) throw ERRORS.GRP.NOT_FOUND();

      const matches = await prisma.match.findMany({
        where: { groupId, status: { in: ["closed", "finished"] } },
        select: { id: true },
      });
      // v1: goals/"Artilheiro" leaderboard only — `GroupRanking` also exposes
      // assists/cleanSheets/mvp/presence/points (`ranking.repository.ts`),
      // future work to pick a category per share link.
      const ranking = await aggregateRanking(
        prisma,
        matches.map((m) => m.id),
        20,
      );
      const idx = ranking.goals.findIndex((row) => row.playerId === playerId);
      if (idx < 0) throw ERRORS.PLR.NOT_FOUND();
      const row = ranking.goals[idx];
      if (!row) throw ERRORS.PLR.NOT_FOUND();

      const etag = etagFor(["rank", groupId, playerId, idx, row.value]);
      let png = cache.get(etag);
      if (!png) {
        png = await renderRanking({
          groupName: group.name,
          playerName: row.name,
          rank: idx + 1,
          category: "Artilheiro",
          value: row.value,
        });
        cache.set(etag, png);
      }
      sendPng(reply, req, etag, png);
    },
  );
};
