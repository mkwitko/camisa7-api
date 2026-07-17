import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createCourtRepository } from "@/http/api/courts/court.repository";
import { requireUser } from "@/http/hooks/auth";
import { prisma } from "@/infra/db/client";
import { presentBooking } from "../booking.presenter";
import { createBookingRepository } from "../booking.repository";
import { BookingParams, BookingResponse } from "../booking.schema";
import { createCancelBookingService } from "./cancel-booking.service";

export const cancelBookingRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().post(
    "/bookings/:id/cancel",
    {
      schema: {
        operationId: "cancelBooking",
        tags: ["bookings"],
        params: BookingParams,
        response: { 200: BookingResponse },
      },
    },
    async (req, reply) => {
      const service = createCancelBookingService({
        bookingRepo: createBookingRepository(prisma),
        courtRepo: createCourtRepository(prisma),
      });
      const { userId } = requireUser(req);
      const booking = await service({ bookingId: req.params.id, userId });
      void reply.code(200).send(presentBooking(booking));
    },
  );
};
