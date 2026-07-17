import type { FastifyPluginAsync } from "fastify";
import { createVenueRoute } from "./create-venue/create-venue.controller";
import { getVenueRoute } from "./get-venue/get-venue.controller";
import { listMyVenuesRoute } from "./list-my-venues/list-my-venues.controller";
import { updateVenueRoute } from "./update-venue/update-venue.controller";

/**
 * Registers all `venues` resource routes (Marketplace V1). All authenticated
 * (no `config.public`). `/venues/mine` (static) is registered before
 * `/venues/:id` (parametric), though Fastify's radix tree prioritizes static
 * routes regardless of order.
 */
export const venuesRoutes: FastifyPluginAsync = async (app) => {
  await app.register(createVenueRoute);
  await app.register(listMyVenuesRoute);
  await app.register(getVenueRoute);
  await app.register(updateVenueRoute);
};
