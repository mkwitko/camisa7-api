import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createAuthRepository } from "@/http/api/auth/auth.repository";
import { createCourtRepository } from "@/http/api/courts/court.repository";
import { requireUser } from "@/http/hooks/auth";
import { prisma } from "@/infra/db/client";
import { CreateBookingBody, CreateBookingResponse } from "../booking.schema";
import { createCreateBookingService } from "./create-booking.service";

export const createBookingRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().post(
    "/bookings",
    {
      schema: {
        operationId: "createBooking",
        tags: ["bookings"],
        body: CreateBookingBody,
        response: { 201: CreateBookingResponse },
      },
    },
    async (req, reply) => {
      const { userId } = requireUser(req);
      const service = createCreateBookingService({
        db: prisma,
        courtRepo: createCourtRepository(prisma),
        authRepo: createAuthRepository(prisma),
      });
      const result = await service({ ...req.body, userId });
      void reply.code(201).send(result);
    },
  );
};
