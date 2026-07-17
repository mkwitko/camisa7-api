import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createVenueRepository } from "@/http/api/venues/venue.repository";
import { requireUser } from "@/http/hooks/auth";
import { prisma } from "@/infra/db/client";
import { presentCourt } from "../court.presenter";
import { createCourtRepository } from "../court.repository";
import { CourtResponse, CreateCourtBody, VenueCourtsParams } from "../court.schema";
import { createCreateCourtService } from "./create-court.service";

export const createCourtRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().post(
    "/venues/:venueId/courts",
    {
      schema: {
        operationId: "createCourt",
        tags: ["courts"],
        params: VenueCourtsParams,
        body: CreateCourtBody,
        response: { 201: CourtResponse },
      },
    },
    async (req, reply) => {
      const service = createCreateCourtService({
        venueRepo: createVenueRepository(prisma),
        courtRepo: createCourtRepository(prisma),
      });
      const { userId } = requireUser(req);
      const court = await service({ ...req.body, venueId: req.params.venueId, userId });
      void reply.code(201).send(presentCourt(court));
    },
  );
};
