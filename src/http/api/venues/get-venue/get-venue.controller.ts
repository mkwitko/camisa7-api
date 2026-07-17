import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { prisma } from "@/infra/db/client";
import { presentVenue } from "../venue.presenter";
import { createVenueRepository } from "../venue.repository";
import { VenueParams, VenueResponse } from "../venue.schema";
import { createGetVenueService } from "./get-venue.service";

export const getVenueRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().get(
    "/venues/:id",
    {
      schema: {
        operationId: "getVenue",
        tags: ["venues"],
        params: VenueParams,
        response: { 200: VenueResponse },
      },
    },
    async (req, reply) => {
      const service = createGetVenueService({ venueRepo: createVenueRepository(prisma) });
      const venue = await service(req.params.id);
      void reply.code(200).send(presentVenue(venue));
    },
  );
};
