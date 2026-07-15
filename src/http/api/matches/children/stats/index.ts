import type { FastifyPluginAsync } from "fastify";
import { listStatsRoute } from "./list-stats/list-stats.controller";
import { logStatsRoute } from "./log-stats/log-stats.controller";

/** Registers the `stats` child-resource routes under `/matches/:id/stats`. */
export const statsRoutes: FastifyPluginAsync = async (app) => {
  await app.register(logStatsRoute);
  await app.register(listStatsRoute);
};
