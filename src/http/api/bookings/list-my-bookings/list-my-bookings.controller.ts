import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { requireUser } from "@/http/hooks/auth";
import { prisma } from "@/infra/db/client";
import { presentBooking } from "../booking.presenter";
import { createBookingRepository } from "../booking.repository";
import { BookingListResponse } from "../booking.schema";
import { createListMyBookingsService } from "./list-my-bookings.service";

export const listMyBookingsRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().get(
    "/bookings/mine",
    {
      schema: {
        operationId: "listMyBookings",
        tags: ["bookings"],
        response: { 200: BookingListResponse },
      },
    },
    async (req, reply) => {
      const service = createListMyBookingsService({ bookingRepo: createBookingRepository(prisma) });
      const { userId } = requireUser(req);
      const bookings = await service(userId);
      void reply.code(200).send(bookings.map(presentBooking));
    },
  );
};
