import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createAuthRepository } from "@/http/api/auth/auth.repository";
import { requireUser } from "@/http/hooks/auth";
import { prisma } from "@/infra/db/client";
import { presentVenue } from "../venue.presenter";
import { createVenueRepository } from "../venue.repository";
import { CreateVenueBody, VenueResponse } from "../venue.schema";
import { createCreateVenueService } from "./create-venue.service";

export const createVenueRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().post(
    "/venues",
    {
      schema: {
        operationId: "createVenue",
        tags: ["venues"],
        body: CreateVenueBody,
        response: { 201: VenueResponse },
      },
    },
    async (req, reply) => {
      const service = createCreateVenueService({
        venueRepo: createVenueRepository(prisma),
        authRepo: createAuthRepository(prisma),
      });
      const { userId } = requireUser(req);
      const venue = await service({ ...req.body, userId });
      void reply.code(201).send(presentVenue(venue));
    },
  );
};
