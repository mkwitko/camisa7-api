import type { FastifyPluginAsync } from "fastify";
import { getReputationRoute } from "./get-reputation/get-reputation.controller";
import { setReputationRoute } from "./set-reputation/set-reputation.controller";

/** Registers the `reputation` child-resource routes under `/matches/:id/reputation`. */
export const reputationRoutes: FastifyPluginAsync = async (app) => {
  await app.register(setReputationRoute);
  await app.register(getReputationRoute);
};
