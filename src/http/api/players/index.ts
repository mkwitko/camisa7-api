import type { FastifyPluginAsync } from "fastify";
import { careerRoutes } from "./children/career/index";
import { claimPlayerRoute } from "./claim-player/claim-player.controller";

/**
 * Registers all `players` resource routes. Fase 1 (F1-4) added the `career`
 * child resource (`GET /players/:playerId/career`); F1-5 adds the
 * top-level `POST /players/claim` (guest→account merge, sibling of
 * `children/`, not `:playerId`-scoped — same "top-level action" placement
 * `finalize-match` uses under `matches/`). `Player` still has no top-level
 * CRUD routes of its own (created only as a side effect of other flows, see
 * `players.repository.ts`).
 */
export const playersRoutes: FastifyPluginAsync = async (app) => {
  await app.register(careerRoutes);
  await app.register(claimPlayerRoute);
};
