import type { FastifyPluginAsync } from "fastify";
import { approveBookingRoute } from "./approve-booking/approve-booking.controller";
import { cancelBookingRoute } from "./cancel-booking/cancel-booking.controller";
import { completeBookingRoute } from "./complete-booking/complete-booking.controller";
import { createBookingRoute } from "./create-booking/create-booking.controller";
import { getAvailabilityRoute } from "./get-availability/get-availability.controller";
import { listMyBookingsRoute } from "./list-my-bookings/list-my-bookings.controller";
import { listVenueBookingsRoute } from "./list-venue-bookings/list-venue-bookings.controller";
import { rejectBookingRoute } from "./reject-booking/reject-booking.controller";

/**
 * Registers all `bookings` resource routes (Marketplace V2). All
 * authenticated (no `config.public`). `GET /courts/:id/availability`
 * addresses a court directly (mirrors `courtsRoutes`'s `PATCH /courts/:id`);
 * `POST /bookings` is the core booking flow. `/bookings/mine` (static) is
 * registered before the `/bookings/:id/*` lifecycle routes (parametric),
 * though Fastify's radix tree prioritizes static routes regardless of order
 * (same note as `venuesRoutes`). `GET /venues/:id/bookings` (the owner's
 * agenda) lives here too — see `list-venue-bookings.controller.ts`.
 */
export const bookingsRoutes: FastifyPluginAsync = async (app) => {
  await app.register(getAvailabilityRoute);
  await app.register(createBookingRoute);
  await app.register(listMyBookingsRoute);
  await app.register(cancelBookingRoute);
  await app.register(listVenueBookingsRoute);
  await app.register(approveBookingRoute);
  await app.register(rejectBookingRoute);
  await app.register(completeBookingRoute);
};
