import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createVenueRepository } from "@/http/api/venues/venue.repository";
import { VenueParams } from "@/http/api/venues/venue.schema";
import { requireUser } from "@/http/hooks/auth";
import { prisma } from "@/infra/db/client";
import { presentBooking } from "../booking.presenter";
import { createBookingRepository } from "../booking.repository";
import { BookingListResponse, VenueBookingsQuery } from "../booking.schema";
import { createListVenueBookingsService } from "./list-venue-bookings.service";

/**
 * `GET /venues/:id/bookings` lives in the `bookings` module (per the B7
 * brief) even though the route path is venue-scoped — it's the owner's
 * agenda across the venue's courts, not a per-court concern.
 */
export const listVenueBookingsRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().get(
    "/venues/:id/bookings",
    {
      schema: {
        operationId: "listVenueBookings",
        tags: ["bookings"],
        params: VenueParams,
        querystring: VenueBookingsQuery,
        response: { 200: BookingListResponse },
      },
    },
    async (req, reply) => {
      const service = createListVenueBookingsService({
        bookingRepo: createBookingRepository(prisma),
        venueRepo: createVenueRepository(prisma),
      });
      const { userId } = requireUser(req);
      const bookings = await service({
        venueId: req.params.id,
        userId,
        from: req.query.from,
        to: req.query.to,
      });
      void reply.code(200).send(bookings.map(presentBooking));
    },
  );
};
