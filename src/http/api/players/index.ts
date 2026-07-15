import type { FastifyPluginAsync } from "fastify";
import { careerRoutes } from "./children/career/index";

/**
 * Registers all `players` resource routes. Fase 1 (F1-4) only adds the
 * `career` child resource (`GET /players/:playerId/career`) — `Player`
 * itself has no top-level CRUD routes of its own yet (created only as a
 * side effect of other flows, see `players.repository.ts`).
 */
export const playersRoutes: FastifyPluginAsync = async (app) => {
  await app.register(careerRoutes);
};
