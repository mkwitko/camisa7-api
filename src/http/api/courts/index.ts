import type { FastifyPluginAsync } from "fastify";
import { createCourtRoute } from "./create-court/create-court.controller";
import { listCourtsRoute } from "./list-courts/list-courts.controller";
import { setPriceRulesRoute } from "./set-price-rules/set-price-rules.controller";
import { updateCourtRoute } from "./update-court/update-court.controller";

/**
 * Registers all `courts` resource routes (Marketplace V2). All authenticated
 * (no `config.public`). `POST`/`GET /venues/:venueId/courts` nest under the
 * parent `Venue`; `PATCH /courts/:id` and `PUT /courts/:id/price-rules`
 * address a court directly (mirrors `venuesRoutes`).
 */
export const courtsRoutes: FastifyPluginAsync = async (app) => {
  await app.register(createCourtRoute);
  await app.register(listCourtsRoute);
  await app.register(updateCourtRoute);
  await app.register(setPriceRulesRoute);
};
