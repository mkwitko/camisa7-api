import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createGroupsRepository } from "@/http/api/groups/groups.repository";
import { createVenueRepository } from "@/http/api/venues/venue.repository";
import { requireUser } from "@/http/hooks/auth";
import { prisma } from "@/infra/db/client";
import { presentMatch } from "../matches.presenter";
import { createMatchesRepository } from "../matches.repository";
import { MatchResponse } from "../matches.schema";
import { CreateMatchBody, CreateMatchParams } from "./create-match.schema";
import { createCreateMatchService } from "./create-match.service";

export const createMatchRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().post(
    "/groups/:id/matches",
    {
      schema: {
        operationId: "createMatch",
        tags: ["matches"],
        params: CreateMatchParams,
        body: CreateMatchBody,
        response: { 201: MatchResponse },
      },
    },
    async (req, reply) => {
      const service = createCreateMatchService({
        matchesRepo: createMatchesRepository(prisma),
        groupsRepo: createGroupsRepository(prisma),
        venueRepo: createVenueRepository(prisma),
      });
      const { userId } = requireUser(req);
      const match = await service({ ...req.body, groupId: req.params.id, userId });
      void reply.code(201).send(presentMatch(match));
    },
  );
};
