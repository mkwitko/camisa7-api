import type { FastifyPluginAsync } from "fastify";
import { createBookingRoute } from "./create-booking/create-booking.controller";
import { getAvailabilityRoute } from "./get-availability/get-availability.controller";

/**
 * Registers all `bookings` resource routes (Marketplace V2). All
 * authenticated (no `config.public`). `GET /courts/:id/availability`
 * addresses a court directly (mirrors `courtsRoutes`'s `PATCH /courts/:id`);
 * `POST /bookings` is the core booking flow.
 */
export const bookingsRoutes: FastifyPluginAsync = async (app) => {
  await app.register(getAvailabilityRoute);
  await app.register(createBookingRoute);
};
