import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod/v4";
import { env } from "@/config/env";
import { aggregateRanking } from "@/http/api/groups/children/ranking/ranking.repository";
import { createReputationRepository } from "@/http/api/matches/children/reputation/reputation.repository";
import { createPlayerCareerRepository } from "@/http/api/players/children/career/career.repository";
import { createPlayersRepository } from "@/http/api/players/players.repository";
import { presentPublicProfile } from "@/http/api/players/public-profile/public-profile.presenter";
import { createGetPublicProfileService } from "@/http/api/players/public-profile/public-profile.service";
import { prisma } from "@/infra/db/client";
import { ERRORS } from "@/shared/errors/catalog";
import { buildLandingHtml, type ShareSubject } from "./landing";
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
    reputationRepo: createReputationRepository(prisma),
  });
  const { player: p, career, counts } = await service(player.id);
  return presentPublicProfile(p, career, counts);
}

/** Sends a cached PNG with `ETag`/`Cache-Control`, or a bare 304 on a matching `If-None-Match`. */
function sendPng(reply: FastifyReply, req: FastifyRequest, etag: string, png: Buffer) {
  if (req.headers["if-none-match"] === etag) {
    void reply
      .header("Cache-Control", "public, max-age=300, s-maxage=86400")
      .header("ETag", etag)
      .header("Cross-Origin-Resource-Policy", "cross-origin")
      .code(304)
      .send();
    return;
  }
  void reply
    .header("Content-Type", "image/png")
    .header("Cache-Control", "public, max-age=300, s-maxage=86400")
    .header("ETag", etag)
    // futebol-web may embed this as an `<img src>` from a different origin
    // than the API — helmet's global default CORP (`same-origin`) would
    // block that cross-origin embed, so this route opts into `cross-origin`.
    .header("Cross-Origin-Resource-Policy", "cross-origin")
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
      // Include every field `renderCarta` actually draws (goals/wins, not
      // just bestOverall/matchesPlayed) so a stat update busts the cached PNG.
      const etag = etagFor([
        "carta",
        profile.playerId,
        profile.bestOverall,
        profile.matchesPlayed,
        profile.goals,
        profile.wins,
      ]);
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
        select: { name: true, isPublic: true },
      });
      // Same conceal-existence posture as `ranking.service.ts`'s
      // owner-or-member gate: a private group's ranking never leaves the
      // group, so an unauthenticated `/og/ranking` share link 404s exactly
      // like an unknown group would, rather than leaking name/rank/existence.
      if (!group || !group.isPublic) throw ERRORS.GRP.NOT_FOUND();

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

      // `group.name` is organizer-editable — include it so a rename busts
      // the cached PNG (it's rendered into the card by `renderRanking`).
      const etag = etagFor(["rank", groupId, playerId, idx, row.value, group.name]);
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

  // Smart-link HTML shell: crawlers (WhatsApp/IG/Twitter) read the OG meta
  // without executing JS, while a real device runs the redirect script in
  // `landing.ts` to try the app first and fall back to the store/web. Subject
  // defaults to the carta; `?a=<achievementKey>` swaps it to a conquista
  // (only if unlocked — an unknown/locked key silently falls back to carta
  // rather than 404ing the whole share link) and `?r=<groupId>` to a ranking
  // card. Takes precedence in that order, matching the `/og/*` PNG variants.
  typed.get(
    "/j/:slug",
    {
      schema: {
        operationId: "shareLanding",
        tags: ["share"],
        params: z.object({ slug: z.string().min(1) }),
        querystring: z.object({ a: z.string().optional(), r: z.uuid().optional() }),
      },
      config: { public: true },
      // The global `@fastify/helmet` registration (`src/app.ts`) sends the
      // library default CSP (`script-src 'self'`), which silently blocks
      // `landing.ts`'s inline smart-link `<script>` in every real browser —
      // it would never run and the tap-to-open-app/store/web redirect would
      // be dead. `@fastify/helmet` merges this route-level `helmet` option
      // over the global config (see its `onRoute`/`onRequest` hooks), so only
      // `/j/:slug` gets `'unsafe-inline'` added to `script-src` — every other
      // route keeps the strict global CSP untouched. The visible `<a href>`
      // fallback in `landing.ts` still works even if this were ever removed.
      helmet: {
        contentSecurityPolicy: {
          directives: { "script-src": ["'self'", "'unsafe-inline'"] },
        },
      },
    },
    async (req, reply) => {
      const profile = await loadProfileBySlug(req.params.slug);
      let subject: ShareSubject = { kind: "carta" };
      let ogImageUrl = `${env.PUBLIC_API_URL}/og/carta/${req.params.slug}.png`;
      if (req.query.a) {
        const a = profile.achievements.find((x) => x.key === req.query.a && x.unlocked);
        if (a) {
          subject = { kind: "conquista", key: a.key, label: a.label };
          ogImageUrl = `${env.PUBLIC_API_URL}/og/conquista/${req.params.slug}/${a.key}.png`;
        }
      } else if (req.query.r) {
        subject = { kind: "ranking", groupId: req.query.r };
        ogImageUrl = `${env.PUBLIC_API_URL}/og/ranking/${req.query.r}/${profile.playerId}.png`;
      }
      const webUrl = `${env.PUBLIC_WEB_URL}/j/${req.params.slug}`;
      const html = buildLandingHtml({
        slug: req.params.slug,
        playerName: profile.name,
        subject,
        ogImageUrl,
        webUrl,
        appLink: webUrl,
        iosStore: env.IOS_APP_STORE_URL,
        androidStore: env.ANDROID_STORE_URL,
      });
      void reply.header("Content-Type", "text/html; charset=utf-8").code(200).send(html);
    },
  );
};
