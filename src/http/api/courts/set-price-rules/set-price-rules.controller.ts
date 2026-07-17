import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { requireUser } from "@/http/hooks/auth";
import { prisma } from "@/infra/db/client";
import { presentCourt } from "../court.presenter";
import { createCourtRepository } from "../court.repository";
import { CourtParams, CourtResponse, SetPriceRulesBody } from "../court.schema";
import { createSetPriceRulesService } from "./set-price-rules.service";

export const setPriceRulesRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().put(
    "/courts/:id/price-rules",
    {
      schema: {
        operationId: "setCourtPriceRules",
        tags: ["courts"],
        params: CourtParams,
        body: SetPriceRulesBody,
        response: { 200: CourtResponse },
      },
    },
    async (req, reply) => {
      const service = createSetPriceRulesService({ courtRepo: createCourtRepository(prisma) });
      const { userId } = requireUser(req);
      const court = await service({ courtId: req.params.id, userId, body: req.body });
      void reply.code(200).send(presentCourt(court));
    },
  );
};
