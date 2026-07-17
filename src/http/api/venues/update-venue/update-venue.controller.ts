import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { requireUser } from "@/http/hooks/auth";
import { prisma } from "@/infra/db/client";
import { presentVenue } from "../venue.presenter";
import { createVenueRepository } from "../venue.repository";
import { UpdateVenueBody, VenueParams, VenueResponse } from "../venue.schema";
import { createUpdateVenueService } from "./update-venue.service";

export const updateVenueRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().patch(
    "/venues/:id",
    {
      schema: {
        operationId: "updateVenue",
        tags: ["venues"],
        params: VenueParams,
        body: UpdateVenueBody,
        response: { 200: VenueResponse },
      },
    },
    async (req, reply) => {
      const service = createUpdateVenueService({ venueRepo: createVenueRepository(prisma) });
      const { userId } = requireUser(req);
      const venue = await service({ venueId: req.params.id, userId, patch: req.body });
      void reply.code(200).send(presentVenue(venue));
    },
  );
};
