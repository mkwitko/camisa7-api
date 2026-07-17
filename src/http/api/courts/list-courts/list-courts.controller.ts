import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createVenueRepository } from "@/http/api/venues/venue.repository";
import { requireUser } from "@/http/hooks/auth";
import { prisma } from "@/infra/db/client";
import { presentCourt } from "../court.presenter";
import { createCourtRepository } from "../court.repository";
import { ListCourtsResponse, VenueCourtsParams } from "../court.schema";
import { createListCourtsService } from "./list-courts.service";

export const listCourtsRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().get(
    "/venues/:venueId/courts",
    {
      schema: {
        operationId: "listCourts",
        tags: ["courts"],
        params: VenueCourtsParams,
        response: { 200: ListCourtsResponse },
      },
    },
    async (req, reply) => {
      const service = createListCourtsService({
        courtRepo: createCourtRepository(prisma),
        venueRepo: createVenueRepository(prisma),
      });
      const { userId } = requireUser(req);
      const courts = await service({ venueId: req.params.venueId, userId });
      void reply.code(200).send(courts.map(presentCourt));
    },
  );
};
