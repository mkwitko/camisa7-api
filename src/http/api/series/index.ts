import type { FastifyPluginAsync } from "fastify";
import { createSeriesRoute } from "./create-series/create-series.controller";
import { getSeriesRoute } from "./get-series/get-series.controller";
import { listGroupSeriesRoute } from "./list-series/list-series.controller";

/**
 * Registers all `series` resource routes. All authenticated (no
 * `config.public`). Create/list are nested under the parent group
 * (`/groups/:id/series` — you need the group id to create or scope a list);
 * get is flat (`/series/:id`) since a series is fully addressable by its own
 * id and `assertSeriesOwner` resolves the parent group from
 * `series.groupId` (see `series.authz.ts`).
 */
export const seriesRoutes: FastifyPluginAsync = async (app) => {
  await app.register(createSeriesRoute);
  await app.register(listGroupSeriesRoute);
  await app.register(getSeriesRoute);
};
