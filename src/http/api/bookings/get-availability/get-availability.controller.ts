import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createCourtRepository } from "@/http/api/courts/court.repository";
import { CourtParams } from "@/http/api/courts/court.schema";
import { requireUser } from "@/http/hooks/auth";
import { prisma } from "@/infra/db/client";
import { createBookingRepository } from "../booking.repository";
import { AvailabilityQuery, AvailabilityResponse } from "../booking.schema";
import { createGetAvailabilityService } from "./get-availability.service";

export const getAvailabilityRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().get(
    "/courts/:id/availability",
    {
      schema: {
        operationId: "getCourtAvailability",
        tags: ["bookings"],
        params: CourtParams,
        querystring: AvailabilityQuery,
        response: { 200: AvailabilityResponse },
      },
    },
    async (req, reply) => {
      requireUser(req);
      const service = createGetAvailabilityService({
        courtRepo: createCourtRepository(prisma),
        bookingRepo: createBookingRepository(prisma),
      });
      const slots = await service({ courtId: req.params.id, date: req.query.date });
      void reply.code(200).send(slots);
    },
  );
};
