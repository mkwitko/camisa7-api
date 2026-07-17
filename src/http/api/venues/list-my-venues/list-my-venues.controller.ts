import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { requireUser } from "@/http/hooks/auth";
import { prisma } from "@/infra/db/client";
import { presentVenue } from "../venue.presenter";
import { createVenueRepository } from "../venue.repository";
import { ListMyVenuesResponse } from "../venue.schema";
import { createListMyVenuesService } from "./list-my-venues.service";

export const listMyVenuesRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().get(
    "/venues/mine",
    {
      schema: {
        operationId: "listMyVenues",
        tags: ["venues"],
        response: { 200: ListMyVenuesResponse },
      },
    },
    async (req, reply) => {
      const service = createListMyVenuesService({ venueRepo: createVenueRepository(prisma) });
      const { userId } = requireUser(req);
      const venues = await service(userId);
      void reply.code(200).send(venues.map(presentVenue));
    },
  );
};
