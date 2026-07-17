import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createCourtRepository } from "@/http/api/courts/court.repository";
import { requireUser } from "@/http/hooks/auth";
import { prisma } from "@/infra/db/client";
import { presentBooking } from "../booking.presenter";
import { createBookingRepository } from "../booking.repository";
import { BookingParams, BookingResponse } from "../booking.schema";
import { createRejectBookingService } from "./reject-booking.service";

export const rejectBookingRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().post(
    "/bookings/:id/reject",
    {
      schema: {
        operationId: "rejectBooking",
        tags: ["bookings"],
        params: BookingParams,
        response: { 200: BookingResponse },
      },
    },
    async (req, reply) => {
      const service = createRejectBookingService({
        bookingRepo: createBookingRepository(prisma),
        courtRepo: createCourtRepository(prisma),
      });
      const { userId } = requireUser(req);
      const booking = await service({ bookingId: req.params.id, userId });
      void reply.code(200).send(presentBooking(booking));
    },
  );
};
