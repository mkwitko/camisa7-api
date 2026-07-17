import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { requireUser } from "@/http/hooks/auth";
import { prisma } from "@/infra/db/client";
import { presentCourt } from "../court.presenter";
import { createCourtRepository } from "../court.repository";
import { CourtParams, CourtResponse, UpdateCourtBody } from "../court.schema";
import { createUpdateCourtService } from "./update-court.service";

export const updateCourtRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().patch(
    "/courts/:id",
    {
      schema: {
        operationId: "updateCourt",
        tags: ["courts"],
        params: CourtParams,
        body: UpdateCourtBody,
        response: { 200: CourtResponse },
      },
    },
    async (req, reply) => {
      const service = createUpdateCourtService({ courtRepo: createCourtRepository(prisma) });
      const { userId } = requireUser(req);
      const court = await service({ courtId: req.params.id, userId, patch: req.body });
      void reply.code(200).send(presentCourt(court));
    },
  );
};
