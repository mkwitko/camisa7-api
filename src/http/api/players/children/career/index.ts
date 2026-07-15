import type { FastifyPluginAsync } from "fastify";
import { getCareerRoute } from "./get-career/get-career.controller";

/** Registers the `career` child-resource routes under `/players/:playerId/career`. */
export const careerRoutes: FastifyPluginAsync = async (app) => {
  await app.register(getCareerRoute);
};
