import type { FastifyPluginAsync } from "fastify";
import { groupReputationRoute } from "./reputation.controller";

/** Registers the `reputation` child-resource route under `/groups/:id/reputation`. */
export const groupReputationRoutes: FastifyPluginAsync = async (app) => {
  await app.register(groupReputationRoute);
};
