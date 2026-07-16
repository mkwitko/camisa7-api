import type { FastifyPluginAsync } from "fastify";
import { addSeriesDatesRoute } from "./add-series-dates/add-series-dates.controller";
import { createSeriesRoute } from "./create-series/create-series.controller";
import { endSeriesRoute } from "./end-series/end-series.controller";
import { getSeriesRoute } from "./get-series/get-series.controller";
import { listGroupSeriesRoute } from "./list-series/list-series.controller";
import { updateSeriesRoute } from "./update-series/update-series.controller";

/**
 * Registers all `series` resource routes. All authenticated (no
 * `config.public`). Create/list are nested under the parent group
 * (`/groups/:id/series` — you need the group id to create or scope a list);
 * get/update/end/add-dates are flat (`/series/:id`[...]) since a series is
 * fully addressable by its own id and `assertSeriesOwner` resolves the
 * parent group from `series.groupId` (see `series.authz.ts`).
 */
export const seriesRoutes: FastifyPluginAsync = async (app) => {
  await app.register(createSeriesRoute);
  await app.register(listGroupSeriesRoute);
  await app.register(getSeriesRoute);
  await app.register(updateSeriesRoute);
  await app.register(endSeriesRoute);
  await app.register(addSeriesDatesRoute);
};
