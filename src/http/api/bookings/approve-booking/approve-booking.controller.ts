import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createAuthRepository } from "@/http/api/auth/auth.repository";
import { createCourtRepository } from "@/http/api/courts/court.repository";
import { requireUser } from "@/http/hooks/auth";
import { prisma } from "@/infra/db/client";
import { createBookingRepository } from "../booking.repository";
import { ApproveBookingResponse, BookingParams } from "../booking.schema";
import { createApproveBookingService } from "./approve-booking.service";

export const approveBookingRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().post(
    "/bookings/:id/approve",
    {
      schema: {
        operationId: "approveBooking",
        tags: ["bookings"],
        params: BookingParams,
        response: { 200: ApproveBookingResponse },
      },
    },
    async (req, reply) => {
      const service = createApproveBookingService({
        db: prisma,
        bookingRepo: createBookingRepository(prisma),
        courtRepo: createCourtRepository(prisma),
        authRepo: createAuthRepository(prisma),
      });
      const { userId } = requireUser(req);
      const result = await service({ bookingId: req.params.id, userId });
      void reply.code(200).send(result);
    },
  );
};
