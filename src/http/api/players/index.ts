import type { FastifyPluginAsync } from "fastify";
import { careerRoutes } from "./children/career/index";
import { timelineRoute } from "./children/timeline/timeline.controller";
import { avatarUploadUrlRoute } from "./me/avatar/avatar.controller";
import { myPlayerRoute, updateMyPlayerRoute } from "./me/me.controller";
import { upcomingMatchesRoute } from "./me/upcoming-matches/upcoming-matches.controller";
import { publicProfileRoute } from "./public-profile/public-profile.controller";
import { searchPlayersRoute } from "./search/search.controller";

/**
 * Registers all `players` resource routes. Fase 1 (F1-4) added the `career`
 * child resource (`GET /players/:playerId/career`); F1-5 originally added a
 * top-level `POST /players/claim` (guest→account merge, authorized by PHONE
 * MATCH ALONE) — a security review flagged that as a takeover vector (any
 * caller who knew a guest's phone number could claim their history) and it
 * was REMOVED before any frontend ever wired it up, replaced by the
 * organizer-vouched `POST /groups/:id/members/:memberId/link-user` (see
 * `groups/children/members/link-member-user/`), which reuses the same merge
 * machinery (`merge-guest-player.repository.ts`) but gates it on the GROUP
 * OWNER vouching for the guest's identity instead of a guessable phone
 * number; F1-6 adds the PUBLIC (no auth) `GET /players/:playerId/public-profile`
 * shareable card; F1-7 adds `GET /players/me`, letting the app resolve its
 * own canonical player without an already-known `playerId`. `Player` still
 * has no top-level CRUD routes of its own (created only as a side effect of
 * other flows, see `players.repository.ts`).
 */
export const playersRoutes: FastifyPluginAsync = async (app) => {
  await app.register(careerRoutes);
  await app.register(timelineRoute);
  await app.register(myPlayerRoute);
  await app.register(updateMyPlayerRoute);
  await app.register(avatarUploadUrlRoute);
  await app.register(searchPlayersRoute);
  await app.register(upcomingMatchesRoute);
  await app.register(publicProfileRoute);
};
